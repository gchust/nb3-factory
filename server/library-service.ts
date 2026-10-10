import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import { ApiError } from '@nocobase/app-server/router';

import {
  LIBRARY_DOCUMENTS_COLLECTION,
  LIBRARY_RESOURCE_ID,
  type LibraryDocumentRow,
} from './library-resources.js';

/** One document as the browser reads it. */
export interface LibraryDocumentView {
  readonly id: string;
  readonly title: string;
  readonly content: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListLibraryDocumentsOptions {
  readonly page: number;
  readonly pageSize: number;
}

export interface LibraryDocumentPage {
  readonly rows: readonly LibraryDocumentView[];
  readonly total: number;
}

export interface CreateLibraryDocumentValues {
  readonly title: string;
  readonly content?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
  readonly ownerId: string;
  readonly ownerName?: string | null;
}

export interface UpdateLibraryDocumentValues {
  readonly title?: string;
  readonly content?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

/**
 * Resolves the composite decision for one library action and returns the
 * collection policy it carries.
 *
 * The service does not authorize itself: the route resolves the policy once,
 * before validating input, and hands it to every repository call so the same
 * decision governs the whole request.
 */
export interface LibraryAuthorization {
  policy(
    context: AuthorizationContext,
    action: 'view' | 'create' | 'edit' | 'delete',
  ): Promise<RepositoryPolicy>;
}

export function createLibraryAuthorization(): LibraryAuthorization {
  return {
    async policy(context, action) {
      const decision = await context.authorize({
        resource: { type: 'composite', id: LIBRARY_RESOURCE_ID },
        action,
      });
      const policy =
        decision.conditions?.database?.[LIBRARY_DOCUMENTS_COLLECTION];
      if (decision.effect === 'deny' || !policy) {
        throw new AuthorizationDeniedError(decision);
      }
      return policy;
    },
  };
}

export interface LibraryService {
  list(
    policy: RepositoryPolicy,
    options: ListLibraryDocumentsOptions,
  ): Promise<LibraryDocumentPage>;
  get(policy: RepositoryPolicy, id: string): Promise<LibraryDocumentView>;
  create(
    policy: RepositoryPolicy,
    values: CreateLibraryDocumentValues,
  ): Promise<LibraryDocumentView>;
  update(
    policy: RepositoryPolicy,
    id: string,
    values: UpdateLibraryDocumentValues,
  ): Promise<LibraryDocumentView>;
  remove(policy: RepositoryPolicy, id: string): Promise<void>;
  /** The display name of an account, used to denormalize `ownerName`. */
  accountName(userId: string): Promise<string | null>;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  if (typeof value === 'number') return new Date(value).toISOString();
  return '';
}

function toView(row: Partial<LibraryDocumentRow>): LibraryDocumentView {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    content: row.content ?? null,
    ownerId: String(row.ownerId ?? ''),
    ownerName: row.ownerName ?? null,
    published: row.published === true,
    confidential: row.confidential === true,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function notFound(id: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'LIBRARY_DOCUMENT_NOT_FOUND',
    domain: 'library',
    message: `Document ${id} was not found.`,
  });
}

export function createLibraryService(
  database: DatabaseManager,
): LibraryService {
  const repository = (policy: RepositoryPolicy) =>
    database
      .repository<LibraryDocumentRow>(LIBRARY_DOCUMENTS_COLLECTION)
      .withPolicy(policy);

  return {
    async list(policy, { page, pageSize }) {
      const scoped = repository(policy);
      const [rows, total] = await Promise.all([
        scoped.findMany({
          sort: (sort) => [
            sort.field('createdAt').desc(),
            sort.field('id').desc(),
          ],
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        scoped.count(),
      ]);
      return {
        rows: rows.map((row) => toView(row)),
        total,
      };
    },

    async get(policy, id) {
      const row = await repository(policy).findOne({ filter: { id } });
      if (!row) throw notFound(id);
      return toView(row);
    },

    async create(policy, values) {
      const now = new Date();
      const { record } = await repository(policy).createOne({
        values: {
          id: crypto.randomUUID(),
          title: values.title,
          content: values.content ?? null,
          published: values.published ?? false,
          confidential: values.confidential ?? false,
          ownerId: values.ownerId,
          ownerName: values.ownerName ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
      return toView(record);
    },

    async update(policy, id, values) {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (values.title !== undefined) patch.title = values.title;
      if (values.content !== undefined) patch.content = values.content;
      if (values.published !== undefined) patch.published = values.published;
      if (values.confidential !== undefined) {
        patch.confidential = values.confidential;
      }
      // An out-of-scope target is a `RECORD_NOT_FOUND` repository error, which
      // the application answers as 404 without disclosing the hidden record.
      const { record } = await repository(policy).updateOne({
        filter: { id },
        values: patch,
      });
      return toView(record);
    },

    async remove(policy, id) {
      await repository(policy).deleteOne({ filter: { id } });
    },

    async accountName(userId) {
      const row = await database
        .connection()
        .query.selectFrom('user')
        .select('name')
        .where('id', '=', userId)
        .executeTakeFirst();
      return row ? String(row.name) : null;
    },
  };
}
