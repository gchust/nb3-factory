import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import type { SharingRule } from '@nocobase/authorization/sharing-rules';
import type { SharingRulesAuthorizationApi } from '@nocobase/authorization/sharing-rules';
import type {
  DatabaseConnection,
  DatabaseManager,
  Repository,
} from '@nocobase/db';
import { buildFilter, type FilterNode } from '@nocobase/repository-input';

import { LIBRARY_RESOURCE } from './library-resources.js';
import type {
  LibraryDocumentList,
  LibraryDocumentRow,
  LibraryDocumentShare,
  LibraryDocumentView,
} from './library-types.js';

export class LibraryDocumentNotFoundError extends Error {
  public constructor() {
    super('Library document not found');
    this.name = 'LibraryDocumentNotFoundError';
  }
}

export class LibraryDocumentNotShareableError extends Error {
  public constructor() {
    super('Confidential library documents cannot be shared');
    this.name = 'LibraryDocumentNotShareableError';
  }
}

export interface ListLibraryDocumentsInput {
  authorization: AuthorizationContext;
  search?: string;
  /** Limit the list to records the caller owns, used by the management page for non-administrators. */
  ownedOnly?: boolean;
  page: number;
  pageSize: number;
}

export interface CreateLibraryDocumentInput {
  authorization: AuthorizationContext;
  title: string;
  body: string;
  published: boolean;
  confidential: boolean;
}

export interface UpdateLibraryDocumentInput {
  authorization: AuthorizationContext;
  id: string;
  title?: string;
  body?: string;
  published?: boolean;
  confidential?: boolean;
}

export interface LibraryService {
  list(input: ListLibraryDocumentsInput): Promise<LibraryDocumentList>;
  get(
    authorization: AuthorizationContext,
    id: string,
  ): Promise<LibraryDocumentView>;
  create(input: CreateLibraryDocumentInput): Promise<LibraryDocumentView>;
  update(input: UpdateLibraryDocumentInput): Promise<LibraryDocumentView>;
  remove(authorization: AuthorizationContext, id: string): Promise<void>;
  shareCandidates(
    excludeUserId: string,
  ): Promise<readonly LibraryDocumentShare[]>;
  listShares(
    authorization: AuthorizationContext,
    id: string,
  ): Promise<readonly LibraryDocumentShare[]>;
  setShares(
    authorization: AuthorizationContext,
    id: string,
    userIds: readonly string[],
  ): Promise<readonly LibraryDocumentShare[]>;
}

type LibraryAuthorization = AppAuthorization &
  SharingRulesAuthorizationApi<DatabaseConnection>;

function sharingRuleKey(documentId: string): string {
  return `library-document-${documentId}`;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
}

function toIso(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/**
 * A policy-bound read returns `Partial<Row>` because the type cannot see that the allowlist names every field.
 * The library's read permission does name every field, so restore the complete record and fail loudly if a field
 * disappears from that allowlist rather than serving a half-built document.
 */
function completeDocument(
  record: Partial<LibraryDocumentRow>,
): LibraryDocumentRow {
  if (
    typeof record.id !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.body !== 'string' ||
    typeof record.ownerId !== 'string' ||
    typeof record.published !== 'boolean' ||
    typeof record.confidential !== 'boolean' ||
    record.createdAt === undefined ||
    record.updatedAt === undefined
  ) {
    throw new Error(
      'The libraryDocuments read permission must expose every document field.',
    );
  }
  return record as LibraryDocumentRow;
}

function mapDocument(
  document: LibraryDocumentRow,
  ownerName: string,
): LibraryDocumentView {
  return {
    id: document.id,
    title: document.title,
    body: document.body,
    ownerId: document.ownerId,
    ownerName,
    published: document.published,
    confidential: document.confidential,
    createdAt: toIso(document.createdAt),
    updatedAt: toIso(document.updatedAt),
  };
}

export function createLibraryService(
  database: DatabaseManager,
  authorization: AppAuthorization,
): LibraryService {
  const sharingRules = (authorization as LibraryAuthorization).sharingRules;
  if (!sharingRules) {
    throw new Error('The library requires the sharing rules plugin.');
  }
  const documents = (): Repository<
    LibraryDocumentRow,
    Partial<LibraryDocumentRow>,
    Partial<LibraryDocumentRow>
  > => database.repository<LibraryDocumentRow>('libraryDocuments');

  const users = (): Repository<UserRow> => database.repository<UserRow>('user');

  async function ownerNames(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const found = await users().findMany({
      filter: (filter) =>
        filter.or(unique.map((id) => filter.string('id').eq(id))),
      select: (select) => select.fields('id', 'name'),
    });
    return new Map(found.map((user) => [user.id, user.name]));
  }

  async function userShares(
    userIds: readonly string[],
  ): Promise<readonly LibraryDocumentShare[]> {
    if (!userIds.length) return [];
    const found = await users().findMany({
      filter: (filter) =>
        filter.or(userIds.map((id) => filter.string('id').eq(id))),
      sort: (sort) => sort.field('name').asc(),
      select: (select) => select.fields('id', 'name', 'email'),
    });
    return found.map((user) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
    }));
  }

  function sharedUserIds(rule: SharingRule | undefined): readonly string[] {
    return (
      rule?.subjects
        .filter((subject) => subject.type === 'user')
        .map((subject) => subject.id) ?? []
    );
  }

  async function scopedDocuments(
    context: AuthorizationContext,
    action: 'view' | 'create' | 'edit' | 'delete',
  ) {
    const policy = await authorization.database.policyFor(
      'libraryDocuments',
      context,
      { resource: LIBRARY_RESOURCE, action },
    );
    return documents().withPolicy(policy);
  }

  /**
   * Confidential documents are only for their owner and unrestricted administrators. The record access resolver
   * already enforces that base scope, but a sharing rule adds a record on top of it and could accidentally name a
   * confidential document. Apply this check to every read path so a stale or mistaken rule cannot expose one.
   */
  async function canReadConfidential(
    context: AuthorizationContext,
    document: LibraryDocumentRow,
  ): Promise<boolean> {
    if (!document.confidential) return true;
    if (document.ownerId === context.identity.principal.id) return true;
    return (await context.snapshot()).unrestricted;
  }

  async function assertVisible(
    context: AuthorizationContext,
    record: Partial<LibraryDocumentRow> | undefined,
  ): Promise<LibraryDocumentRow> {
    if (!record) throw new LibraryDocumentNotFoundError();
    const complete = completeDocument(record);
    if (!(await canReadConfidential(context, complete))) {
      throw new LibraryDocumentNotFoundError();
    }
    return complete;
  }

  return {
    async list({
      authorization: context,
      search,
      ownedOnly = false,
      page,
      pageSize,
    }) {
      const repository = await scopedDocuments(context, 'view');
      const unrestricted = (await context.snapshot()).unrestricted;
      const normalized = search?.trim();
      const filter = buildFilter((builder) => {
        const parts: FilterNode[] = [];
        if (!unrestricted) {
          // A sharing rule can add a record beyond the base scope; never let one add a confidential document.
          parts.push(
            builder.or([
              builder.boolean('confidential').isFalse(),
              builder.string('ownerId').eq(context.identity.principal.id),
            ]),
          );
        }
        if (normalized) {
          parts.push(
            builder.or([
              builder
                .text('title')
                .includes(normalized, { mode: 'insensitive' }),
              builder
                .text('body')
                .includes(normalized, { mode: 'insensitive' }),
            ]),
          );
        }
        if (ownedOnly) {
          parts.push(
            builder.string('ownerId').eq(context.identity.principal.id),
          );
        }
        if (!parts.length) return builder.and([]);
        return parts.length === 1 ? parts[0] : builder.and(parts);
      });

      const [records, total] = await Promise.all([
        repository.findMany({
          ...(filter ? { filter } : {}),
          sort: (sort) => sort.field('updatedAt').desc(),
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        repository.count(filter ? { filter } : {}),
      ]);

      const documents = records.map(completeDocument);
      const names = await ownerNames(
        documents.map((document) => document.ownerId),
      );
      return {
        items: documents.map((document) =>
          mapDocument(document, names.get(document.ownerId) ?? ''),
        ),
        total: Number(total),
      };
    },

    async get(context, id) {
      const repository = await scopedDocuments(context, 'view');
      const complete = await assertVisible(
        context,
        await repository.findOne({ filter: { id } }),
      );
      const names = await ownerNames([complete.ownerId]);
      return mapDocument(complete, names.get(complete.ownerId) ?? '');
    },

    async create({ authorization: context, ...input }) {
      const repository = await scopedDocuments(context, 'create');
      const now = new Date().toISOString();
      const result = await repository.createOne({
        values: {
          id: crypto.randomUUID(),
          title: input.title,
          body: input.body,
          ownerId: context.identity.principal.id,
          published: input.published,
          confidential: input.confidential,
          createdAt: now,
          updatedAt: now,
        },
      });
      const complete = completeDocument(result.record);
      const names = await ownerNames([complete.ownerId]);
      return mapDocument(complete, names.get(complete.ownerId) ?? '');
    },

    async update({ authorization: context, id, ...changes }) {
      const visible = await scopedDocuments(context, 'view');
      await assertVisible(context, await visible.findOne({ filter: { id } }));
      const repository = await scopedDocuments(context, 'edit');
      const result = await repository.updateOne({
        filter: { id },
        values: {
          ...(changes.title === undefined ? {} : { title: changes.title }),
          ...(changes.body === undefined ? {} : { body: changes.body }),
          ...(changes.published === undefined
            ? {}
            : { published: changes.published }),
          ...(changes.confidential === undefined
            ? {}
            : { confidential: changes.confidential }),
          updatedAt: new Date().toISOString(),
        },
      });
      const complete = completeDocument(result.record);
      const names = await ownerNames([complete.ownerId]);
      return mapDocument(complete, names.get(complete.ownerId) ?? '');
    },

    async remove(context, id) {
      const visible = await scopedDocuments(context, 'view');
      await assertVisible(context, await visible.findOne({ filter: { id } }));
      const repository = await scopedDocuments(context, 'delete');
      await repository.deleteOne({ filter: { id } });
      // A rule that survives its document would be a stale grant, so remove it with the document.
      if (await sharingRules.get(sharingRuleKey(id))) {
        await sharingRules.delete(sharingRuleKey(id));
      }
    },

    async shareCandidates(excludeUserId) {
      const found = await users().findMany({
        filter: (filter) => filter.string('id').ne(excludeUserId),
        sort: (sort) => sort.field('name').asc(),
        limit: 100,
        select: (select) => select.fields('id', 'name', 'email'),
      });
      return found.map((user) => ({
        userId: user.id,
        name: user.name,
        email: user.email,
      }));
    },

    async listShares(context, id) {
      const repository = await scopedDocuments(context, 'edit');
      await assertVisible(
        context,
        await repository.findOne({ filter: { id } }),
      );
      const rule = await sharingRules.get(sharingRuleKey(id));
      return userShares(sharedUserIds(rule));
    },

    async setShares(context, id, userIds) {
      const repository = await scopedDocuments(context, 'edit');
      const document = await assertVisible(
        context,
        await repository.findOne({ filter: { id } }),
      );

      const unique = [...new Set(userIds)];
      const key = sharingRuleKey(id);
      if (!unique.length) {
        if (await sharingRules.get(key)) await sharingRules.delete(key);
        return [];
      }
      // An existing stale rule can still be cleared above; confidential documents never gain a new share.
      if (document.confidential) {
        throw new LibraryDocumentNotShareableError();
      }

      // Sharing only widens view access to this one record. It never grants edit or unlocks a document for everyone.
      const rule: SharingRule = {
        key,
        resource: { type: 'composite', id: LIBRARY_RESOURCE },
        actions: [
          {
            action: 'view',
            scopeKey: 'documents',
            selection: { type: 'records', ids: [id] },
          },
        ],
        title: `共享：${document.title}`,
        subjects: unique.map((userId) => ({ type: 'user', id: userId })),
        reason: 'A library document was shared explicitly.',
      };
      if (await sharingRules.get(key)) {
        await sharingRules.update(key, rule);
      } else {
        await sharingRules.create(rule);
      }
      return userShares(unique);
    },
  };
}
