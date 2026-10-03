import type { DatabaseManager } from '@nocobase/db';
import type { AuthorizationContext } from '@nocobase/authorization/core';

import type {
  OrderView,
  ServiceOrderQueryService,
} from './order-query-service.js';
import type {
  KnowledgeArticle,
  ServiceKnowledgeService,
} from './knowledge-service.js';
import { asIso, asNumber, asText } from './values.js';

export interface AssistantCitation {
  kind: 'order' | 'knowledge' | 'manual';
  id: string | number;
  title: string;
  subtitle?: string;
  detail?: string;
  href?: string;
}

export interface AssistantReply {
  question: string;
  answer: string;
  citations: AssistantCitation[];
  draft: string;
  grounded: boolean;
  degraded: boolean;
  reason: string;
  orderId: number | null;
  createdAt: string;
}

export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  payload: AssistantReply | null;
  degraded: boolean;
  orderId: number | null;
  createdAt: string;
}

export interface AssistantEmployee {
  username: string;
  nickname: string;
  position: string;
  bio: string;
  enabled: boolean;
  builtIn: boolean;
}

export interface AssistantLlmService {
  name: string;
  title: string;
  provider: string;
  enabled: boolean;
}

export interface AssistantKnowledgeBase {
  key: string;
  name: string;
  enabled: boolean;
  documentCount: number;
  llmService: string;
  embeddingModel: string;
}

export interface AssistantDocument {
  id: number;
  knowledgeBaseKey: string;
  title: string;
  filename: string;
  indexStatus: string;
  segmentCount: number;
  errorMessage: string;
}

export interface AssistantStatus {
  employees: AssistantEmployee[];
  llmServices: AssistantLlmService[];
  knowledgeBases: AssistantKnowledgeBase[];
  documents: AssistantDocument[];
  modelConfigured: boolean;
}

interface RawRow {
  [key: string]: unknown;
}

/**
 * The retrieval-based service assistant.
 *
 * It answers from business records the caller is allowed to see — orders,
 * repair knowledge and the device-manual library — and cites every source it
 * used. It is deliberately honest about what it did: when no LLM service is
 * enabled it reports that the answer is a document retrieval, not a generated
 * one, and it never invents a resolution when no source matches. The
 * conversation is persisted per user (and per order) so a refresh restores it.
 *
 * Reading the AI Knowledge Base tables directly couples this application to
 * that plugin's storage. It is confined here, guarded so a missing table
 * degrades to "no manuals" instead of failing the page, and used only to
 * display the real processing status the plugin writes.
 */
export class ServiceAssistantService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly queries: ServiceOrderQueryService,
    private readonly knowledge: ServiceKnowledgeService,
  ) {}

  async status(): Promise<AssistantStatus> {
    const { employees, services } = await this.readAiConfiguration();
    const { knowledgeBases, documents } = await this.readManuals();
    return {
      employees,
      llmServices: services,
      knowledgeBases,
      documents,
      modelConfigured: services.some((service) => service.enabled),
    };
  }

  /**
   * The AI Employee and model configuration live in plugin tables. An
   * application that does not register those plugins has no such tables, so a
   * missing one degrades to "nothing configured" instead of failing the page.
   */
  private async readAiConfiguration(): Promise<{
    employees: AssistantEmployee[];
    services: AssistantLlmService[];
  }> {
    try {
      const query = this.database.query();
      const employees = rowsOf<RawRow>(
        await query
          .selectFrom('aiEmployees')
          .select([
            'username',
            'nickname',
            'position',
            'bio',
            'enabled',
            'builtIn',
          ])
          .orderBy('sort', 'asc')
          .execute(),
      ).map((row): AssistantEmployee => ({
        username: asText(row.username),
        nickname: asText(row.nickname),
        position: asText(row.position),
        bio: asText(row.bio),
        enabled: row.enabled !== false && row.enabled !== 0,
        builtIn: row.builtIn === true || row.builtIn === 1,
      }));

      const services = rowsOf<RawRow>(
        await query
          .selectFrom('llmServices')
          .select(['name', 'title', 'provider', 'enabled'])
          .orderBy('sort', 'asc')
          .execute(),
      ).map((row): AssistantLlmService => ({
        name: asText(row.name),
        title: asText(row.title) || asText(row.name),
        provider: asText(row.provider),
        enabled: row.enabled !== false && row.enabled !== 0,
      }));
      return { employees, services };
    } catch {
      return { employees: [], services: [] };
    }
  }

  async history(
    userId: string,
    orderId?: number,
  ): Promise<AssistantMessage[]> {
    const query = this.database.query();
    let builder = query
      .selectFrom('serviceAssistantMessages')
      .select([
        'id',
        'role',
        'content',
        'payload',
        'degraded',
        'orderId',
        'createdAt',
      ])
      .where('userId', '=', userId);
    builder =
      orderId === undefined
        ? builder.where('orderId', 'is', null)
        : builder.where('orderId', '=', orderId);
    const rows = rowsOf<RawRow>(await builder.orderBy('id', 'asc').execute());
    return rows.slice(-200).map(toMessage);
  }

  async ask(
    context: AuthorizationContext,
    userId: string,
    input: { question: string; orderId?: number },
  ): Promise<AssistantReply> {
    const question = input.question.trim();
    const orderId = input.orderId ?? null;
    const now = new Date();

    const evidence = await this.gather(context, question, orderId ?? undefined);
    const status = await this.status();
    const { answer, citations, draft, grounded } = compose(
      question,
      evidence,
      status,
    );
    const reason = status.modelConfigured
      ? '已启用 LLM 服务，但本应用未接入生成式问答；以下回答由业务资料检索生成。'
      : '未启用 LLM 服务；以下回答由业务资料检索生成，未调用生成模型。';
    const reply: AssistantReply = {
      question,
      answer,
      citations,
      draft,
      grounded,
      degraded: !status.modelConfigured,
      reason,
      orderId,
      createdAt: now.toISOString(),
    };

    await this.persist(userId, orderId, question, reply, now);
    return reply;
  }

  private async gather(
    context: AuthorizationContext,
    question: string,
    orderId?: number,
  ): Promise<{
    orders: OrderView[];
    knowledge: KnowledgeArticle[];
    manuals: AssistantDocument[];
    primaryOrder: OrderView | null;
  }> {
    const terms = extractTerms(question);
    const visible = await this.queries.list(context, { pageSize: 200 });
    let primaryOrder: OrderView | null = null;
    if (orderId !== undefined) {
      primaryOrder =
        visible.find((order) => order.id === orderId) ??
        (await this.queries.detail(context, orderId)) ??
        null;
    }
    const orders = rank(visible, terms, (order) =>
      [order.title, order.orderNo, order.problemDescription ?? ''].join(' '),
    ).slice(0, 5);

    const articles = await this.knowledge.list(context);
    const knowledge = rank(articles, terms, (article) =>
      [article.title, article.body ?? ''].join(' '),
    ).slice(0, 5);

    const { documents } = await this.readManuals();
    const manuals = rank(documents, terms, (document) =>
      [document.title, document.filename].join(' '),
    ).slice(0, 5);

    return { orders, knowledge, manuals, primaryOrder };
  }

  private async readManuals(): Promise<{
    knowledgeBases: AssistantKnowledgeBase[];
    documents: AssistantDocument[];
  }> {
    try {
      const query = this.database.query();
      const bases = rowsOf<RawRow>(
        await query
          .selectFrom('aiKnowledgeBase')
          .select([
            'key',
            'name',
            'enabled',
            'documentCount',
            'llmService',
            'embeddingModel',
          ])
          .execute(),
      ).map((row): AssistantKnowledgeBase => ({
        key: asText(row.key) || asText(row.name),
        name: asText(row.name),
        enabled: row.enabled !== false && row.enabled !== 0,
        documentCount: asNumber(row.documentCount) ?? 0,
        llmService: asText(row.llmService),
        embeddingModel: asText(row.embeddingModel),
      }));
      const documents = rowsOf<RawRow>(
        await query
          .selectFrom('aiKnowledgeBaseDocs')
          .select([
            'id',
            'knowledgeBaseKey',
            'title',
            'filename',
            'indexStatus',
            'segmentCount',
            'errorMessage',
          ])
          .execute(),
      ).map((row): AssistantDocument => ({
        id: asNumber(row.id) ?? 0,
        knowledgeBaseKey: asText(row.knowledgeBaseKey),
        title: asText(row.title) || asText(row.filename),
        filename: asText(row.filename),
        indexStatus: asText(row.indexStatus) || 'UNKNOWN',
        segmentCount: asNumber(row.segmentCount) ?? 0,
        errorMessage: asText(row.errorMessage),
      }));
      return { knowledgeBases: bases, documents };
    } catch {
      // The knowledge-base plugin may be absent; the assistant still works
      // from orders and repair knowledge.
      return { knowledgeBases: [], documents: [] };
    }
  }

  private async persist(
    userId: string,
    orderId: number | null,
    question: string,
    reply: AssistantReply,
    now: Date,
  ): Promise<void> {
    const query = this.database.query();
    await query
      .insertInto('serviceAssistantMessages')
      .values({
        userId,
        orderId,
        role: 'user',
        content: question,
        payload: null,
        degraded: false,
        createdAt: now,
      })
      .execute();
    await query
      .insertInto('serviceAssistantMessages')
      .values({
        userId,
        orderId,
        role: 'assistant',
        content: reply.answer,
        payload: reply as unknown as Record<string, unknown>,
        degraded: reply.degraded,
        createdAt: new Date(now.getTime() + 1),
      })
      .execute();
  }
}

function toMessage(row: RawRow): AssistantMessage {
  const role = asText(row.role) === 'assistant' ? 'assistant' : 'user';
  return {
    id: asNumber(row.id) ?? 0,
    role,
    content: asText(row.content),
    payload: (row.payload as AssistantReply | null) ?? null,
    degraded: row.degraded === true || row.degraded === 1,
    orderId: asNumber(row.orderId),
    createdAt: asIso(row.createdAt) ?? new Date().toISOString(),
  };
}

function rowsOf<T>(rows: readonly unknown[]): T[] {
  return rows.filter(
    (row): row is T => row !== null && typeof row === 'object',
  );
}

/** Latin words plus CJK bigrams; enough to rank short records by overlap. */
function extractTerms(input: string): string[] {
  const lower = input.toLowerCase();
  const latin = lower.match(/[a-z0-9]{2,}/g) ?? [];
  const cjk = lower.match(/[\u4e00-\u9fff]/g) ?? [];
  const bigrams: string[] = [];
  for (let index = 0; index + 1 < cjk.length; index += 1) {
    bigrams.push(`${cjk[index]}${cjk[index + 1]}`);
  }
  return Array.from(new Set([...latin, ...bigrams]));
}

function rank<T>(
  rows: readonly T[],
  terms: readonly string[],
  text: (row: T) => string,
): T[] {
  if (terms.length === 0) {
    return [...rows];
  }
  return rows
    .map((row) => {
      const haystack = text(row).toLowerCase();
      const overlap = terms.reduce(
        (total, term) => (haystack.includes(term) ? total + 1 : total),
        0,
      );
      return { row, overlap };
    })
    .filter((item) => item.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap)
    .map((item) => item.row);
}

function compose(
  question: string,
  evidence: {
    orders: OrderView[];
    knowledge: KnowledgeArticle[];
    manuals: AssistantDocument[];
    primaryOrder: OrderView | null;
  },
  status: AssistantStatus,
): {
  answer: string;
  citations: AssistantCitation[];
  draft: string;
  grounded: boolean;
} {
  const citations: AssistantCitation[] = [];
  const ordered = evidence.primaryOrder
    ? [
        evidence.primaryOrder,
        ...evidence.orders.filter(
          (order) => order.id !== evidence.primaryOrder?.id,
        ),
      ]
    : evidence.orders;
  for (const order of ordered) {
    citations.push({
      kind: 'order',
      id: order.id,
      title: `${order.orderNo} · ${order.title}`,
      subtitle: `${order.status} · ${order.priority}`,
      detail: order.problemDescription ?? undefined,
      href: `/service/orders/${order.id}`,
    });
  }
  for (const article of evidence.knowledge) {
    citations.push({
      kind: 'knowledge',
      id: article.id,
      title: article.title,
      subtitle: article.status,
      detail: article.body ?? undefined,
      href: '/service/knowledge',
    });
  }
  for (const document of evidence.manuals) {
    citations.push({
      kind: 'manual',
      id: document.id,
      title: document.title,
      subtitle: `索引状态：${document.indexStatus}`,
      detail:
        document.errorMessage ||
        (document.segmentCount > 0
          ? `已分段 ${document.segmentCount} 段`
          : '尚未完成分段/向量化'),
      href: '/service/manuals',
    });
  }

  if (citations.length === 0) {
    return {
      answer:
        '没有找到可核实的业务依据，因此不能给出处理建议。请在“维修知识”中补充内容，或由有权限的用户在“设备手册”中上传资料后重试。',
      citations,
      draft: '',
      grounded: false,
    };
  }

  const lines: string[] = [];
  lines.push(`针对“${question}”，共找到 ${citations.length} 条可用依据：`);
  let index = 0;
  for (const order of ordered) {
    index += 1;
    lines.push(
      `${index}. 工单 ${order.orderNo}（${order.title}）：${order.problemDescription ?? '无问题描述'}`,
    );
  }
  for (const article of evidence.knowledge) {
    index += 1;
    lines.push(`${index}. 维修知识《${article.title}》：${article.body ?? ''}`);
  }
  for (const document of evidence.manuals) {
    index += 1;
    lines.push(
      `${index}. 设备手册《${document.title}》（索引状态 ${document.indexStatus}${document.errorMessage ? `，${document.errorMessage}` : ''}）`,
    );
  }
  if (!status.modelConfigured) {
    lines.push(
      '当前未启用 LLM 服务，以上为资料检索结果，不是模型生成的回答。',
    );
  }

  const draft = buildDraft(ordered[0], evidence.knowledge, evidence.manuals);
  return { answer: lines.join('\n'), citations, draft, grounded: true };
}

function buildDraft(
  order: OrderView | undefined,
  knowledge: KnowledgeArticle[],
  manuals: AssistantDocument[],
): string {
  if (!order) {
    return '';
  }
  const steps = knowledge
    .map((article) => article.body?.trim())
    .filter((body): body is string => !!body);
  const headers = manuals.map((manual) => manual.title);
  const lines = [
    `处理工单 ${order.orderNo}（${order.title}）`,
    '',
    `问题：${order.problemDescription ?? ''}`,
    '',
    '建议步骤：',
  ];
  if (steps.length === 0) {
    lines.push('1. 确认设备型号与故障现象，记录现场检查结果。');
    lines.push('2. 按手册排查并更换故障件，完成后复测。');
  } else {
    steps.forEach((step, position) => {
      lines.push(`${position + 1}. ${step}`);
    });
  }
  if (headers.length > 0) {
    lines.push('', `参考资料：${headers.join('、')}`);
  }
  return lines.join('\n');
}
