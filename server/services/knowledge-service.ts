import type { DatabaseManager, FilterNode } from '@nocobase/db';
import type { AccessService } from './access-service.js';
import {
  invalid,
  notFound,
  type AssistantMessageRow,
  type KnowledgeArticleRow,
  type ServiceActor,
} from './contracts.js';
import { DEVICE_MANUALS, type DeviceManual } from '../ai/manuals/manuals.js';

export interface KnowledgeArticleView {
  id: number;
  title: string;
  body?: string | null;
  category?: string | null;
  published: boolean;
  authorId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ManualView {
  slug: string;
  title: string;
  deviceModel: string;
  summary: string;
  content: string;
  available: boolean;
}

export interface AssistantCitation {
  sourceType: 'ticket' | 'knowledge' | 'manual';
  reference: string;
  title: string;
  excerpt: string;
}

export interface AssistantAnswer {
  question: string;
  mode: 'model' | 'local-retrieval' | 'unavailable';
  modelAvailable: boolean;
  answer: string;
  /**
   * A suggested process-note draft. It is returned, never persisted: the client
   * puts it in the note field and the engineer has to save it deliberately.
   */
  draft: string;
  citations: AssistantCitation[];
}

/** One persisted assistant exchange, restored on the next page load. */
export interface AssistantMessageView {
  id: number;
  ticketId?: number | null;
  question: string;
  answer: string;
  draft: string;
  citations: AssistantCitation[];
  modelAvailable: boolean;
  createdAt?: string | null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/**
 * Internal knowledge base: published articles for staff, drafts for the
 * supervisor only, plus the device manuals that ship with the application.
 */
export class KnowledgeService {
  private readonly db: DatabaseManager;
  private readonly access: AccessService;

  constructor(db: DatabaseManager, access: AccessService) {
    this.db = db;
    this.access = access;
  }

  async listArticles(
    actor: ServiceActor,
    query: { published?: boolean; keyword?: string } = {},
  ): Promise<KnowledgeArticleView[]> {
    this.access.assertCanReadKnowledge(actor);
    const supervisor = actor.isRoot || actor.isSupervisor;
    const rows = await this.db
      .repository<KnowledgeArticleRow>('serviceKnowledgeArticles')
      .findMany({
        filter: (filter) => {
          const items: FilterNode[] = [];
          if (!supervisor) {
            items.push(filter.boolean('published').isTrue());
          } else if (query.published !== undefined) {
            items.push(
              query.published
                ? filter.boolean('published').isTrue()
                : filter.boolean('published').isFalse(),
            );
          }
          if (query.keyword && query.keyword.trim()) {
            const keyword = query.keyword.trim();
            items.push(
              filter.or([
                filter
                  .string('title')
                  .includes(keyword, { mode: 'insensitive' }),
                filter.text('body').includes(keyword, { mode: 'insensitive' }),
              ]),
            );
          }
          return filter.and(items);
        },
        sort: (sort) => sort.field('updatedAt').desc(),
      });
    return rows.map((row) => this.toView(row));
  }

  async getArticle(
    actor: ServiceActor,
    id: number,
  ): Promise<KnowledgeArticleView> {
    this.access.assertCanReadKnowledge(actor);
    const row = await this.db
      .repository<KnowledgeArticleRow>('serviceKnowledgeArticles')
      .findOne({ filter: { id } });
    if (!row) {
      throw notFound('The knowledge article does not exist.');
    }
    if (this.access.isSupervisorOnlyArticle(actor, row.published)) {
      throw notFound('The knowledge article does not exist.');
    }
    return this.toView(row);
  }

  async createArticle(
    actor: ServiceActor,
    input: {
      title: string;
      body?: string;
      category?: string;
      published?: boolean;
    },
  ): Promise<KnowledgeArticleView> {
    this.access.assertSupervisor(actor);
    if (!input.title || !input.title.trim()) {
      throw invalid('A knowledge article needs a title.');
    }
    const now = new Date();
    const { record } = await this.db
      .repository<KnowledgeArticleRow>('serviceKnowledgeArticles')
      .createOne({
        values: {
          title: input.title,
          body: input.body ?? null,
          category: input.category ?? 'general',
          published: input.published ?? false,
          authorId: actor.id,
          createdAt: now,
          updatedAt: now,
        },
      });
    return this.toView(record);
  }

  async updateArticle(
    actor: ServiceActor,
    id: number,
    input: {
      title?: string;
      body?: string;
      category?: string;
      published?: boolean;
    },
  ): Promise<KnowledgeArticleView> {
    this.access.assertSupervisor(actor);
    const existing = await this.db
      .repository<KnowledgeArticleRow>('serviceKnowledgeArticles')
      .findOne({ filter: { id } });
    if (!existing) {
      throw notFound('The knowledge article does not exist.');
    }
    const now = new Date();
    await this.db
      .repository<KnowledgeArticleRow>('serviceKnowledgeArticles')
      .updateOne({
        filter: { id },
        values: {
          title: input.title ?? existing.title,
          body: input.body ?? existing.body ?? null,
          category: input.category ?? existing.category ?? null,
          published: input.published ?? existing.published,
          updatedAt: now,
        },
      });
    const updated = await this.db
      .repository<KnowledgeArticleRow>('serviceKnowledgeArticles')
      .findOne({ filter: { id } });
    return this.toView(updated!);
  }

  async deleteArticle(actor: ServiceActor, id: number): Promise<void> {
    this.access.assertSupervisor(actor);
    const existing = await this.db
      .repository<KnowledgeArticleRow>('serviceKnowledgeArticles')
      .findOne({ filter: { id } });
    if (!existing) {
      throw notFound('The knowledge article does not exist.');
    }
    await this.db
      .repository<KnowledgeArticleRow>('serviceKnowledgeArticles')
      .deleteOne({ filter: { id } });
  }

  /** Manuals are internal device documentation every service reader may open. */
  listManuals(actor: ServiceActor): ManualView[] {
    this.access.assertCanReadLedger(actor);
    return DEVICE_MANUALS.map((manual) => this.toManualView(manual));
  }

  getManual(actor: ServiceActor, slug: string): ManualView {
    this.access.assertCanReadLedger(actor);
    const manual = DEVICE_MANUALS.find((candidate) => candidate.slug === slug);
    if (!manual) {
      throw notFound('The manual does not exist.');
    }
    return this.toManualView(manual);
  }

  /**
   * Retrieval-backed assistant answer.
   *
   * When a language model is configured the AI Employee answers with the same
   * sources; without one this returns a deterministic keyword answer over the
   * material the caller is allowed to read, and always cites what it used. It
   * never invents a source.
   */
  async askAssistant(
    actor: ServiceActor,
    question: string,
    options: { tickets?: readonly AssistantSeasonSource[] } = {},
  ): Promise<AssistantAnswer> {
    this.access.assertCanReadLedger(actor);
    const normalized = question.trim().toLowerCase();
    if (!normalized) {
      throw invalid('Enter a question for the service assistant.');
    }
    const citations: AssistantCitation[] = [];
    const terms = normalized.split(/\s+/).filter((term) => term.length > 1);

    for (const manual of DEVICE_MANUALS) {
      const haystack =
        `${manual.title} ${manual.summary} ${manual.content}`.toLowerCase();
      const score = terms.reduce(
        (total, term) => (haystack.includes(term) ? total + 1 : total),
        0,
      );
      if (score > 0 || terms.length === 0) {
        citations.push({
          sourceType: 'manual',
          reference: manual.slug,
          title: manual.title,
          excerpt: manual.content.slice(0, 220),
        });
      }
    }

    const articles = await this.db
      .repository<KnowledgeArticleRow>('serviceKnowledgeArticles')
      .findMany({
        filter: (filter) => filter.boolean('published').isTrue(),
      });
    for (const article of articles) {
      const haystack = `${article.title} ${article.body ?? ''}`.toLowerCase();
      const score = terms.reduce(
        (total, term) => (haystack.includes(term) ? total + 1 : total),
        0,
      );
      if (score > 0) {
        citations.push({
          sourceType: 'knowledge',
          reference: String(article.id),
          title: article.title,
          excerpt: (article.body ?? '').slice(0, 220),
        });
      }
    }

    for (const source of options.tickets ?? []) {
      const haystack =
        `${source.code} ${source.title} ${source.detail}`.toLowerCase();
      const score = terms.reduce(
        (total, term) => (haystack.includes(term) ? total + 1 : total),
        0,
      );
      if (score > 0) {
        citations.push({
          sourceType: 'ticket',
          reference: String(source.id),
          title: `${source.code} ${source.title}`,
          excerpt: source.detail.slice(0, 220),
        });
      }
    }

    const limited = citations.slice(0, 6);
    const answer = limited.length
      ? `Found ${limited.length} matching source(s). Review the citations below and confirm against the device manual before saving to the process note.`
      : 'No matching ticket, published article or manual was found for this question.';
    const draft = limited.length
      ? [
          `Diagnosis draft for: ${question}`,
          ...limited.map(
            (citation) =>
              `- ${citation.title} (${citation.sourceType} ${citation.reference})`,
          ),
          'Pending engineer verification before it is saved to the process note.',
        ].join('\n')
      : '';
    return {
      question,
      mode: 'local-retrieval',
      modelAvailable: false,
      answer,
      draft,
      citations: limited,
    };
  }

  /**
   * Persist one assistant exchange for the asking user.
   *
   * The stored draft stays inside this conversation record; it is never copied
   * to a ticket's process note, which only the user can do deliberately.
   */
  async recordAssistantExchange(
    actor: ServiceActor,
    answer: AssistantAnswer,
    input: { ticketId?: number } = {},
  ): Promise<AssistantMessageView> {
    this.access.assertCanReadLedger(actor);
    const now = new Date();
    const { record } = await this.db
      .repository<AssistantMessageRow>('serviceAssistantMessages')
      .createOne({
        values: {
          userId: actor.id,
          ticketId: input.ticketId ?? null,
          question: answer.question,
          answer: answer.answer,
          draft: answer.draft,
          citations: answer.citations,
          modelAvailable: answer.modelAvailable,
          createdAt: now,
          updatedAt: now,
        },
      });
    return this.toAssistantMessageView(record);
  }

  /** The caller's own assistant history, oldest first, for one ticket or all. */
  async listAssistantHistory(
    actor: ServiceActor,
    query: { ticketId?: number; limit?: number } = {},
  ): Promise<AssistantMessageView[]> {
    this.access.assertCanReadLedger(actor);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const rows = await this.db
      .repository<AssistantMessageRow>('serviceAssistantMessages')
      .findMany({
        filter:
          query.ticketId === undefined
            ? { userId: actor.id }
            : { userId: actor.id, ticketId: query.ticketId },
        sort: (sort) => sort.field('createdAt').desc(),
        limit,
      });
    return rows.reverse().map((row) => this.toAssistantMessageView(row));
  }

  private toAssistantMessageView(
    row: AssistantMessageRow,
  ): AssistantMessageView {
    let citations: AssistantCitation[] = [];
    const raw = row.citations;
    if (Array.isArray(raw)) {
      citations = raw as AssistantCitation[];
    } else if (typeof raw === 'string') {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          citations = parsed as AssistantCitation[];
        }
      } catch {
        citations = [];
      }
    }
    return {
      id: row.id,
      ticketId: row.ticketId ?? null,
      question: row.question,
      answer: row.answer,
      draft: row.draft ?? '',
      citations,
      modelAvailable: row.modelAvailable,
      createdAt: toIso(row.createdAt),
    };
  }

  private toView(row: KnowledgeArticleRow): KnowledgeArticleView {
    return {
      id: row.id,
      title: row.title,
      body: row.body ?? null,
      category: row.category ?? null,
      published: row.published,
      authorId: row.authorId ?? null,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  private toManualView(manual: DeviceManual): ManualView {
    return {
      slug: manual.slug,
      title: manual.title,
      deviceModel: manual.deviceModel,
      summary: manual.summary,
      content: manual.content,
      available: true,
    };
  }
}

export interface AssistantSeasonSource {
  id: number;
  code: string;
  title: string;
  detail: string;
}
