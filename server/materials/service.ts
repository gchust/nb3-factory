import type { AuthorizationContext } from '@nocobase/authorization/core';
import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  databaseManagerToken,
  type DatabaseManager,
  type RepositoryPolicy,
  type ScopedRepository,
} from '@nocobase/db';
import type { AssistantConfig } from '../config/assistant.js';
import { createServiceToken } from '@nocobase/service-provider';
import type { MaterialRow } from './resources.js';

export const materialsServiceToken = createServiceToken<MaterialsService>(
  'app/materials-service',
);

/** The registered Authorization resource id for the materials table. */
export const MATERIALS_COLLECTION = 'materials';

/** A readable material, safe to hand to the browser. */
export interface MaterialDto {
  id: number;
  title: string;
  body: string;
  visibility: string;
  updatedAt: string;
}

export interface Citation {
  id: number;
  title: string;
}

export type AnswerOutcome = 'answered' | 'insufficient' | 'denied';

export interface AssistantAnswer {
  answer: string;
  citations: Citation[];
  grounded: boolean;
  outcome: AnswerOutcome;
  /**
   * A client-translatable note:
   *  - `null`: the answer came from the AI service, or no note is needed;
   *  - `ai-not-configured`: no service is configured, so the text is quoted
   *    directly from the materials;
   *  - `ai-unavailable`: a service is configured but the call failed, so the
   *    text falls back to the materials.
   */
  notice: 'ai-not-configured' | 'ai-unavailable' | null;
  llm: { configured: boolean; used: boolean };
}

export interface AssistantMessageDto {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  /** Null on a user turn; how the assistant answered on an assistant turn. */
  outcome: AnswerOutcome | null;
  createdAt: string;
}

function toDto(row: MaterialRow): MaterialDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    visibility: row.visibility,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
  };
}

function toCitation(row: Pick<MaterialRow, 'id' | 'title'>): Citation {
  return { id: Number(row.id), title: row.title };
}

function isOutcome(value: unknown): value is AnswerOutcome {
  return value === 'answered' || value === 'insufficient' || value === 'denied';
}

/** Split a question into CJK bigrams and latin/digit words for matching. */
function tokens(text: string): Set<string> {
  const normalized = text.toLowerCase();
  const result = new Set<string>();
  for (const word of normalized.match(/[a-z0-9]+/g) ?? []) {
    result.add(word);
  }
  const cjk = normalized.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const run of cjk) {
    if (run.length === 1) {
      result.add(run);
      continue;
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      result.add(run.slice(index, index + 2));
    }
  }
  return result;
}

/** How much of the question appears in a material, between 0 and 1. */
function relevance(question: Set<string>, material: MaterialRow): number {
  if (question.size === 0) return 0;
  const haystack = tokens(`${material.title}\n${material.body}`);
  let hits = 0;
  for (const token of question) {
    if (haystack.has(token)) hits += 1;
  }
  return hits / question.size;
}

/**
 * Chooses the readable materials that answer the question. The absolute
 * threshold keeps an unrelated question from being "answered" by a material
 * that merely shares one character, so a question with no basis reports
 * insufficient materials rather than quoting something unrelated. The relative
 * threshold then drops a material that only shares the question's common prefix
 * with the best match, so a specific question cites the material that actually
 * answers it instead of padding the answer with loosely related ones.
 */
function selectMatches(
  question: string,
  materials: MaterialRow[],
): MaterialRow[] {
  const query = tokens(question);
  if (query.size === 0) return [];
  const scored = materials
    .map((material) => ({ material, score: relevance(query, material) }))
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best || best.score < 0.2) return [];
  const cutoff = Math.max(0.2, best.score * 0.6);
  return scored
    .filter((entry) => entry.score >= cutoff)
    .slice(0, 3)
    .map((entry) => entry.material);
}

/** Compose a clean, grounded answer straight from the material text. */
function composeGrounded(matches: MaterialRow[]): string {
  if (matches.length === 1) {
    return matches[0].body;
  }
  return matches
    .map((material) => `${material.title}\n${material.body}`)
    .join('\n\n');
}

export class MaterialsService {
  public constructor(private readonly app: Application) {}

  private get database(): DatabaseManager {
    return this.app.container.resolve(databaseManagerToken);
  }

  private async policyFor(
    context: AuthorizationContext,
  ): Promise<RepositoryPolicy<MaterialRow>> {
    const authorization = this.app.container.resolve(authorizationToken);
    return await authorization.database.policyFor(
      MATERIALS_COLLECTION,
      context,
    );
  }

  /**
   * A policy-aware repository for the materials table. `withPolicy` narrows the
   * compile-time record to the fields the policy allows, so it is restored to
   * `MaterialRow` here; the read policy names every column the service reads.
   */
  private scopedMaterials(
    policy: RepositoryPolicy<MaterialRow>,
  ): ScopedRepository<MaterialRow> {
    return this.database
      .repository<MaterialRow>('materials')
      .withPolicy(policy) as unknown as ScopedRepository<MaterialRow>;
  }

  /** Materials the caller may read, newest edits last. */
  public async list(context: AuthorizationContext): Promise<MaterialDto[]> {
    const policy = await this.policyFor(context);
    if (policy.read === false) return [];
    const rows = await this.scopedMaterials(policy).findMany();
    return rows.map(toDto).sort((left, right) => left.id - right.id);
  }

  /** One readable material, or `undefined` when it exists but is not visible. */
  public async get(
    context: AuthorizationContext,
    id: number,
  ): Promise<MaterialDto | undefined> {
    const policy = await this.policyFor(context);
    if (policy.read === false) return undefined;
    const row = await this.scopedMaterials(policy).findOne({ filter: { id } });
    return row ? toDto(row) : undefined;
  }

  /** Whether the caller may maintain materials. */
  public async canManage(context: AuthorizationContext): Promise<boolean> {
    const policy = await this.policyFor(context);
    return policy.update !== false;
  }

  /** Updates a material; a denied update throws rather than silently no-ops. */
  public async update(
    context: AuthorizationContext,
    id: number,
    values: { title?: string; body?: string; visibility?: string },
  ): Promise<MaterialDto | undefined> {
    const policy = await this.policyFor(context);
    const repository = this.scopedMaterials(policy);
    await repository.updateOne({
      filter: { id },
      values: { ...values, updatedAt: new Date() } as Partial<MaterialRow>,
    });
    const row = await repository.findOne({ filter: { id } });
    return row ? toDto(row) : undefined;
  }

  /** The stored transcript for one user, oldest first. */
  public async history(userId: string): Promise<AssistantMessageDto[]> {
    const rows = await this.database
      .repository<{
        id: number;
        userId: string;
        role: string;
        content: string;
        citations: unknown;
        outcome: string | null;
        createdAt: Date;
      }>('assistantMessages')
      .findMany({ filter: { userId } });
    return rows
      .sort((left, right) => left.id - right.id)
      .map((row) => ({
        id: row.id,
        role: row.role === 'assistant' ? 'assistant' : 'user',
        content: row.content,
        citations: Array.isArray(row.citations)
          ? (row.citations as Citation[])
          : [],
        outcome: isOutcome(row.outcome) ? row.outcome : null,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : String(row.createdAt),
      }));
  }

  /** Clears one user's transcript. */
  public async clearHistory(userId: string): Promise<void> {
    await this.database
      .repository('assistantMessages')
      .deleteMany({ filter: { userId } });
  }

  private async appendMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    citations: Citation[],
    outcome: AnswerOutcome | null,
  ): Promise<void> {
    const now = new Date();
    await this.database.repository('assistantMessages').createOne({
      values: {
        userId,
        role,
        content,
        citations,
        outcome,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  /**
   * Answers a question from the materials the asker may read, always citing
   * what it used. Never invents an answer: with no matching material it says
   * the materials are insufficient, and when the AI service is unavailable it
   * quotes the matching material instead of pretending to reason.
   */
  public async answer(
    context: AuthorizationContext,
    question: string,
  ): Promise<AssistantAnswer> {
    const materials = await this.readableRows(context);
    if (materials === undefined) {
      return {
        answer: '',
        citations: [],
        grounded: false,
        outcome: 'denied',
        notice: null,
        llm: { configured: false, used: false },
      };
    }
    const matches = selectMatches(question, materials);
    if (matches.length === 0) {
      return {
        answer: '',
        citations: [],
        grounded: false,
        outcome: 'insufficient',
        notice: null,
        llm: { configured: false, used: false },
      };
    }

    const citations = matches.map((material) =>
      toCitation(material as Pick<MaterialRow, 'id' | 'title'>),
    );
    const llmConfig = this.llmConfig();
    const configured = llmConfig !== undefined;
    if (configured) {
      try {
        const answer = await this.invokeLLM(llmConfig, matches, question);
        if (answer) {
          return {
            answer,
            citations,
            grounded: true,
            outcome: 'answered',
            notice: null,
            llm: { configured: true, used: true },
          };
        }
      } catch {
        // Fall through to the grounded, service-free answer.
      }
      return {
        answer: composeGrounded(matches),
        citations,
        grounded: true,
        outcome: 'answered',
        notice: 'ai-unavailable',
        llm: { configured: true, used: false },
      };
    }
    return {
      answer: composeGrounded(matches),
      citations,
      grounded: true,
      outcome: 'answered',
      notice: 'ai-not-configured',
      llm: { configured: false, used: false },
    };
  }

  /** Persists the user turn and the assistant turn around an answer. */
  public async ask(
    context: AuthorizationContext,
    userId: string,
    question: string,
  ): Promise<AssistantAnswer> {
    const trimmed = question.trim();
    await this.appendMessage(userId, 'user', trimmed, [], null);
    const result = await this.answer(context, trimmed);
    if (result.outcome !== 'denied') {
      await this.appendMessage(
        userId,
        'assistant',
        result.answer,
        result.citations,
        result.outcome,
      );
    }
    return result;
  }

  /** Whether an optional model service is configured for this application. */
  public isLLMConfigured(): boolean {
    return this.llmConfig() !== undefined;
  }

  /** All readable rows, or `undefined` when reading is forbidden outright. */
  private async readableRows(
    context: AuthorizationContext,
  ): Promise<MaterialRow[] | undefined> {
    const policy = await this.policyFor(context);
    if (policy.read === false) return undefined;
    return this.scopedMaterials(policy).findMany();
  }

  private llmConfig(): AssistantConfig | undefined {
    const config = this.app.config.get<AssistantConfig>('assistant');
    if (!config?.baseURL || !config.apiKey || !config.model) return undefined;
    return config;
  }

  private async invokeLLM(
    config: {
      baseURL: string;
      apiKey: string;
      model: string;
      timeoutMs: number;
    },
    matches: MaterialRow[],
    question: string,
  ): Promise<string> {
    const base = config.baseURL.replace(/\/+$/, '');
    const endpoint = base.endsWith('/chat/completions')
      ? base
      : `${base}/chat/completions`;
    const materials = matches
      .map(
        (material) =>
          `[资料 ${material.id}] ${material.title}\n${material.body}`,
      )
      .join('\n\n');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                '你是一个只读资料助手。只允许依据下面提供的资料回答，' +
                '不得编造、补充或推断资料之外的信息。若资料不足以回答，' +
                '只回复“资料不足”。回答后另起一行用 [资料 编号] 标注引用来源。',
            },
            {
              role: 'user',
              content: `资料：\n${materials}\n\n问题：${question}`,
            },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`AI service responded with ${response.status}`);
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      return content ?? '';
    } finally {
      clearTimeout(timer);
    }
  }
}
