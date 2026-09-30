import type {
  DatabaseManager,
  RepositoryMutationScalarValue,
  RepositoryPolicy,
} from '@nocobase/db';
import type {
  ServiceKnowledgeArticleRecord,
  ServiceManualRecord,
} from './records.js';
import { asText } from './text.js';

type MutationValues = Record<string, RepositoryMutationScalarValue>;

/**
 * Knowledge articles and manual documents. Article/manual reads receive a
 * Repository Policy so that the caller's data scope (published only, or all)
 * is enforced by the database; the keyword search used by the assistant reads
 * published rows and is authorized by the assistant route itself.
 */

export interface KnowledgeSearchHit {
  kind: 'article' | 'manual';
  id: number;
  title: string;
  summary: string | null;
  category: string | null;
  status: string;
  snippet: string;
}

function like(value: string): string {
  return `%${value}%`;
}

export class ServiceKnowledgeService {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly options: {
      /** True when a vector store and an embedding service are configured. */
      vectorIndexAvailable?: () => boolean;
    } = {},
  ) {}

  /**
   * True when the application can actually build a vector index. With no
   * vector database or embedding service configured the manual text is still
   * stored and keyword-searchable, but it cannot be vectorized.
   */
  private vectorIndexAvailable(): boolean {
    return this.options.vectorIndexAvailable?.() ?? false;
  }

  public async listArticles(
    policy: RepositoryPolicy,
    options: {
      query?: string;
      category?: string;
      deviceCategory?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Record<string, unknown>[]> {
    const repository = this.database.repository<ServiceKnowledgeArticleRecord>(
      'serviceKnowledgeArticles',
    );
    const rows = await repository.withPolicy(policy).findMany({
      filter: (filter) =>
        filter.and([
          ...(options.category
            ? [filter.string('category').eq(options.category)]
            : []),
          ...(options.deviceCategory
            ? [filter.string('deviceCategory').eq(options.deviceCategory)]
            : []),
          ...(options.status
            ? [filter.string('status').eq(options.status)]
            : []),
          ...(options.query
            ? [filter.string('title').includes(options.query)]
            : []),
        ]),
      sort: (sort) => sort.field('updatedAt').desc(),
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
    });
    return rows;
  }

  public async getArticle(
    policy: RepositoryPolicy,
    id: number,
  ): Promise<Record<string, unknown> | undefined> {
    const record = await this.database
      .repository<ServiceKnowledgeArticleRecord>('serviceKnowledgeArticles')
      .withPolicy(policy)
      .findOne({ filter: { id } });
    if (record) {
      await this.incrementView(
        'service_knowledge_articles',
        id,
        record.viewCount,
      );
    }
    return record;
  }

  public async createArticle(
    policy: RepositoryPolicy,
    values: MutationValues,
  ): Promise<Record<string, unknown>> {
    const { record } = await this.database
      .repository<ServiceKnowledgeArticleRecord>('serviceKnowledgeArticles')
      .withPolicy(policy)
      .createOne({ values });
    return record;
  }

  public async updateArticle(
    policy: RepositoryPolicy,
    id: number,
    values: MutationValues,
  ): Promise<Record<string, unknown> | undefined> {
    const { record } = await this.database
      .repository<ServiceKnowledgeArticleRecord>('serviceKnowledgeArticles')
      .withPolicy(policy)
      .updateOne({ filter: { id }, values });
    return record;
  }

  public async listManuals(
    policy: RepositoryPolicy,
    options: {
      query?: string;
      deviceCategory?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Record<string, unknown>[]> {
    const rows = await this.database
      .repository<ServiceManualRecord>('serviceManuals')
      .withPolicy(policy)
      .findMany({
        filter: (filter) =>
          filter.and([
            ...(options.deviceCategory
              ? [filter.string('deviceCategory').eq(options.deviceCategory)]
              : []),
            ...(options.status
              ? [filter.string('status').eq(options.status)]
              : []),
            ...(options.query
              ? [filter.string('title').includes(options.query)]
              : []),
          ]),
        sort: (sort) => sort.field('updatedAt').desc(),
        limit: options.limit ?? 100,
        offset: options.offset ?? 0,
      });
    return rows;
  }

  public async getManual(
    policy: RepositoryPolicy,
    id: number,
  ): Promise<Record<string, unknown> | undefined> {
    const record = await this.database
      .repository<ServiceManualRecord>('serviceManuals')
      .withPolicy(policy)
      .findOne({ filter: { id } });
    if (record) {
      await this.incrementView('service_manuals', id, record.viewCount);
    }
    return record;
  }

  public async createManual(
    policy: RepositoryPolicy,
    values: MutationValues,
  ): Promise<Record<string, unknown>> {
    const { record } = await this.database
      .repository<ServiceManualRecord>('serviceManuals')
      .withPolicy(policy)
      .createOne({ values });
    return record;
  }

  public async updateManual(
    policy: RepositoryPolicy,
    id: number,
    values: MutationValues,
  ): Promise<Record<string, unknown> | undefined> {
    const { record } = await this.database
      .repository<ServiceManualRecord>('serviceManuals')
      .withPolicy(policy)
      .updateOne({ filter: { id }, values });
    return record;
  }

  /** Update a manual's index state without touching authorization fields. */
  public async setManualIndexStatus(
    id: number,
    status: string,
    error: string | null,
  ): Promise<void> {
    await this.database
      .query()
      .updateTable('service_manuals')
      .set({
        indexStatus: status,
        indexError: error,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', id)
      .execute();
  }

  /** Store a manual's Markdown body, e.g. from an uploaded document. */
  public async setManualContent(
    id: number,
    content: string | null,
  ): Promise<void> {
    await this.database
      .query()
      .updateTable('service_manuals')
      .set({ content, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Recompute one manual's index state from the services that are really
   * configured, and persist it. This is what keeps `indexStatus` from being a
   * value nothing ever writes: a manual with no text is `not_indexed`, one
   * that cannot reach a vector service is `blocked` with the reason, and a
   * terminal good state set by a working indexer is left alone.
   */
  public async reconcileManualIndex(
    id: number,
  ): Promise<{ status: string; error: string | null }> {
    const row = await this.database
      .query()
      .selectFrom<Partial<ServiceManualRecord>>('service_manuals')
      .select(['content', 'indexStatus'])
      .where('id', '=', id)
      .executeTakeFirst();
    return this.applyIndexState(
      id,
      asText(row?.content).trim().length > 0,
      row?.indexStatus === null || row?.indexStatus === undefined
        ? ''
        : asText(row.indexStatus),
    );
  }

  /** Reconcile every manual, e.g. after an upgrade adds text to old rows. */
  public async reconcileManuals(): Promise<void> {
    const rows = await this.database
      .query()
      .selectFrom<Partial<ServiceManualRecord>>('service_manuals')
      .select(['id'])
      .execute();
    for (const row of rows) {
      await this.reconcileManualIndex(Number(row.id));
    }
  }

  private async applyIndexState(
    id: number,
    hasContent: boolean,
    current: string,
  ): Promise<{ status: string; error: string | null }> {
    let status: string;
    let error: string | null = null;
    if (hasContent && !this.vectorIndexAvailable()) {
      status = 'blocked';
      error =
        'No vector database or embedding service is configured. The manual text is stored and searchable by keyword, but it has not been vectorized.';
    } else if (
      hasContent &&
      this.vectorIndexAvailable() &&
      current === 'blocked'
    ) {
      // The service is available again; the text is waiting for the indexer.
      status = 'not_indexed';
    } else if (!hasContent) {
      status = 'not_indexed';
    } else {
      // A configured indexer owns `indexing` / `indexed` / `failed`.
      return { status: current || 'not_indexed', error: null };
    }
    await this.setManualIndexStatus(id, status, error);
    return { status, error };
  }

  /**
   * Keyword search across published articles and manuals. This is a real
   * database search over the application's own tables: it needs no model or
   * embedding service, so knowledge lookup works in every environment.
   */
  public async search(
    term: string,
    options: { limit?: number } = {},
  ): Promise<KnowledgeSearchHit[]> {
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
    const pattern = like(term);
    const articles = await this.database
      .query()
      .selectFrom<Partial<ServiceKnowledgeArticleRecord>>(
        'service_knowledge_articles',
      )
      .select(['id', 'title', 'summary', 'category', 'content'])
      .where('status', '=', 'published')
      .where((builder) =>
        builder.or([
          builder('title', 'like', pattern),
          builder('summary', 'like', pattern),
          builder('content', 'like', pattern),
        ]),
      )
      .limit(limit)
      .execute();
    const manuals = await this.database
      .query()
      .selectFrom<Partial<ServiceManualRecord>>('service_manuals')
      .select(['id', 'title', 'summary', 'deviceCategory', 'model', 'content'])
      .where('status', '=', 'published')
      .where((builder) =>
        builder.or([
          builder('title', 'like', pattern),
          builder('summary', 'like', pattern),
          builder('model', 'like', pattern),
          builder('content', 'like', pattern),
        ]),
      )
      .limit(limit)
      .execute();

    const hits: KnowledgeSearchHit[] = [];
    for (const row of articles) {
      hits.push({
        kind: 'article',
        id: Number(row.id),
        title: String(row.title),
        summary: row.summary === null ? null : asText(row.summary),
        category: row.category === null ? null : asText(row.category),
        status: 'published',
        snippet: excerpt(asText(row.content) || asText(row.summary), term),
      });
    }
    for (const row of manuals) {
      hits.push({
        kind: 'manual',
        id: Number(row.id),
        title: String(row.title),
        summary: row.summary === null ? null : asText(row.summary),
        category:
          row.deviceCategory === null ? null : asText(row.deviceCategory),
        status: 'published',
        snippet: excerpt(
          asText(row.content) || asText(row.summary) || asText(row.model),
          term,
        ),
      });
    }
    return hits.slice(0, limit);
  }

  private async incrementView(
    table: string,
    id: number,
    current: unknown,
  ): Promise<void> {
    try {
      await this.database
        .query()
        .updateTable(table)
        .set({ viewCount: Number(current ?? 0) + 1 })
        .where('id', '=', id)
        .execute();
    } catch {
      // A view counter must never fail a read.
    }
  }
}

/** A short window of text around the first match, for a readable search hit. */
function excerpt(text: string, term: string): string {
  if (!text) return '';
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return text.slice(0, 160);
  const start = Math.max(0, index - 60);
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 180)}`;
}
