import type {
  DatabaseManager,
  RepositoryPolicy,
  ScopedRepository,
} from '@nocobase/db';
import { randomUUID } from 'node:crypto';
import { createServiceToken } from '@nocobase/service-provider';

import { DOCUMENTS_COLLECTION, type Document } from './resources.js';

/**
 * The record policy the authorization layer resolved for one request. It comes
 * from binding a composite decision's `conditions.database[documents]`, never
 * from an aggregate collection check, so a grant belonging to another business
 * operation cannot widen it.
 */
export type DocumentPolicy = RepositoryPolicy<Document>;

export interface DocumentListInput {
  readonly limit?: number;
  readonly offset?: number;
}

export interface DocumentListResult {
  readonly items: readonly Document[];
  readonly total: number;
}

export interface DocumentCreateInput {
  readonly title: string;
  readonly body?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

export interface DocumentUpdateInput {
  readonly title?: string;
  readonly body?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

/**
 * Domain logic for the document library. It performs no authorization of its
 * own: every method receives an already-bound record policy from the route,
 * which parsed the HTTP request and decided what to ask the policy for.
 */
export class LibraryService {
  constructor(private readonly database: DatabaseManager) {}

  async list(
    policy: DocumentPolicy,
    input: DocumentListInput = {},
  ): Promise<DocumentListResult> {
    const documents = this.scoped(policy);
    const [items, total] = await Promise.all([
      documents.findMany({
        limit: input.limit,
        offset: input.offset,
        sort: (sort) => sort.field('createdAt').desc(),
      }),
      documents.count(),
    ]);
    return { items, total };
  }

  async get(policy: DocumentPolicy, id: string): Promise<Document | undefined> {
    return this.scoped(policy).findOne({ filter: { id } });
  }

  async create(
    policy: DocumentPolicy,
    input: DocumentCreateInput,
    ownerId: string,
  ): Promise<Document> {
    const now = new Date();
    const { record } = await this.scoped(policy).createOne({
      values: {
        id: randomUUID(),
        code: createDocumentCode(now),
        title: input.title,
        body: input.body ?? null,
        ownerId,
        published: input.published ?? false,
        confidential: input.confidential ?? false,
        createdAt: now,
        updatedAt: now,
      },
    });
    return record;
  }

  async update(
    policy: DocumentPolicy,
    id: string,
    input: DocumentUpdateInput,
  ): Promise<Document> {
    const { record } = await this.scoped(policy).updateOne({
      filter: { id },
      values: { ...input, updatedAt: new Date() },
    });
    return record;
  }

  async remove(policy: DocumentPolicy, id: string): Promise<void> {
    await this.scoped(policy).deleteOne({ filter: { id } });
  }

  /**
   * Binds the policy. `withPolicy` narrows the record type to the fields the
   * policy reads; the cast states that a full read policy keeps the whole row.
   */
  private scoped(policy: DocumentPolicy): ScopedRepository<Document> {
    return this.database
      .repository<Document>(DOCUMENTS_COLLECTION)
      .withPolicy(policy) as unknown as ScopedRepository<Document>;
  }
}

/** A stable, unique-enough code for a document an application created. */
function createDocumentCode(now: Date): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '');
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DOC-${stamp}-${suffix}`;
}

/** The library service, bound to the default connection. */
export const libraryServiceToken =
  createServiceToken<LibraryService>('library-service');
