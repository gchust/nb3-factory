import type { DatabaseManager } from '@nocobase/db';

/**
 * The internal document library's domain rules.
 *
 * Visibility is deliberately ordinary business logic rather than composite grants: a published non-confidential
 * document is readable by any signed-in colleague; a draft is readable by its owner or by someone an administrator
 * shared it with; a confidential document is readable only by its owner (or an unrestricted administrator). Writing
 * (creating, editing, deleting) needs the `document-editor` permission set, which an administrator assigns from the
 * Users page. The service never reads an HTTP context and never returns a status code: the route translates the
 * domain errors below.
 */

export const DOCUMENT_EDITOR_SET = 'document-editor';
export const DOCUMENT_READER_SET = 'document-reader';

export interface DocumentActor {
  readonly userId: string;
  readonly userName: string;
  /** True for the unrestricted `root` holder, who may do anything. */
  readonly unrestricted: boolean;
  /** The keys of the Permission Sets the actor effectively holds. */
  readonly permissionSets: readonly string[];
}

export interface DocumentRecord {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DocumentCapabilities {
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canManageShares: boolean;
}

export interface DocumentView extends DocumentRecord {
  readonly capabilities: DocumentCapabilities;
}

export interface DocumentShareView {
  readonly documentId: string;
  readonly userId: string;
  readonly userName: string | null;
  readonly createdAt: string;
}

export interface CreateDocumentInput {
  readonly title: string;
  readonly body?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

export interface UpdateDocumentInput {
  readonly title?: string;
  readonly body?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

export class DocumentNotFoundError extends Error {
  public readonly code = 'DOCUMENT_NOT_FOUND';
}

export class DocumentForbiddenError extends Error {
  public readonly code = 'DOCUMENT_FORBIDDEN';
}

export interface DocumentService {
  canCreate(actor: DocumentActor): boolean;
  list(actor: DocumentActor): Promise<DocumentView[]>;
  get(actor: DocumentActor, documentId: string): Promise<DocumentView>;
  create(
    actor: DocumentActor,
    input: CreateDocumentInput,
  ): Promise<DocumentView>;
  update(
    actor: DocumentActor,
    documentId: string,
    input: UpdateDocumentInput,
  ): Promise<DocumentView>;
  remove(actor: DocumentActor, documentId: string): Promise<void>;
  listShares(
    actor: DocumentActor,
    documentId: string,
  ): Promise<DocumentShareView[]>;
  share(
    actor: DocumentActor,
    documentId: string,
    userId: string,
  ): Promise<DocumentShareView>;
  revokeShare(
    actor: DocumentActor,
    documentId: string,
    userId: string,
  ): Promise<void>;
}

function isEditor(actor: DocumentActor): boolean {
  return (
    actor.unrestricted || actor.permissionSets.includes(DOCUMENT_EDITOR_SET)
  );
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return new Date().toISOString();
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function toRecord(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    body: toNullableString(row.body),
    ownerId: String(row.ownerId),
    ownerName: toNullableString(row.ownerName),
    published: Boolean(row.published),
    confidential: Boolean(row.confidential),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function createDocumentService(
  database: DatabaseManager,
): DocumentService {
  const query = () => database.query();

  async function sharedDocumentIds(userId: string): Promise<Set<string>> {
    const rows = await query()
      .selectFrom('documentShares')
      .select(['documentId'])
      .where('userId', '=', userId)
      .execute();
    return new Set(rows.map((row) => String(row.documentId)));
  }

  function canView(
    record: DocumentRecord,
    actor: DocumentActor,
    shared: ReadonlySet<string>,
  ): boolean {
    if (actor.unrestricted) {
      return true;
    }
    if (record.ownerId === actor.userId) {
      return true;
    }
    if (record.confidential) {
      return false;
    }
    if (record.published) {
      return true;
    }
    return shared.has(record.id);
  }

  function capabilitiesOf(
    record: DocumentRecord,
    actor: DocumentActor,
  ): DocumentCapabilities {
    const editor = isEditor(actor);
    const canWrite =
      actor.unrestricted || (editor && record.ownerId === actor.userId);
    return {
      canEdit: canWrite,
      canDelete: canWrite,
      canManageShares: actor.unrestricted,
    };
  }

  function toView(record: DocumentRecord, actor: DocumentActor): DocumentView {
    return { ...record, capabilities: capabilitiesOf(record, actor) };
  }

  async function findRecord(
    documentId: string,
  ): Promise<DocumentRecord | undefined> {
    const row = await query()
      .selectFrom('documents')
      .selectAll()
      .where('id', '=', documentId)
      .executeTakeFirst();
    return row ? toRecord(row) : undefined;
  }

  /** The record if the actor may read it; the same not-found error otherwise, so the library does not reveal it exists. */
  async function readVisible(
    actor: DocumentActor,
    documentId: string,
  ): Promise<DocumentRecord> {
    const record = await findRecord(documentId);
    if (!record) {
      throw new DocumentNotFoundError(`Document ${documentId} was not found.`);
    }
    if (
      !actor.unrestricted &&
      !canView(record, actor, await sharedDocumentIds(actor.userId))
    ) {
      throw new DocumentNotFoundError(`Document ${documentId} was not found.`);
    }
    return record;
  }

  function assertWritable(actor: DocumentActor): void {
    if (!isEditor(actor)) {
      throw new DocumentForbiddenError(
        'Maintaining documents needs the document-editor permission.',
      );
    }
  }

  function assertOwnedOrUnrestricted(
    actor: DocumentActor,
    record: DocumentRecord,
  ): void {
    if (actor.unrestricted) {
      return;
    }
    if (record.ownerId !== actor.userId) {
      throw new DocumentForbiddenError(
        'Only the owner or an administrator may change this document.',
      );
    }
  }

  function assertShareManager(actor: DocumentActor): void {
    if (!actor.unrestricted) {
      throw new DocumentForbiddenError(
        'Only an administrator may manage shares.',
      );
    }
  }

  async function getView(
    actor: DocumentActor,
    documentId: string,
  ): Promise<DocumentView> {
    return toView(await readVisible(actor, documentId), actor);
  }

  return {
    canCreate(actor) {
      return isEditor(actor);
    },

    async list(actor) {
      const rows = await query()
        .selectFrom('documents')
        .selectAll()
        .orderBy('createdAt', 'desc')
        .execute();
      const shared = actor.unrestricted
        ? new Set<string>()
        : await sharedDocumentIds(actor.userId);
      return rows
        .map((row) => toRecord(row))
        .filter((record) => canView(record, actor, shared))
        .map((record) => toView(record, actor));
    },

    get: getView,

    async create(actor, input) {
      assertWritable(actor);
      const now = new Date();
      const id = crypto.randomUUID();
      await query()
        .insertInto('documents')
        .values({
          id,
          title: input.title,
          body: input.body ?? null,
          ownerId: actor.userId,
          ownerName: actor.userName,
          published: input.published === true,
          confidential: input.confidential === true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return getView(actor, id);
    },

    async update(actor, documentId, input) {
      const record = await readVisible(actor, documentId);
      assertWritable(actor);
      assertOwnedOrUnrestricted(actor, record);
      const values: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) {
        values.title = input.title;
      }
      if (input.body !== undefined) {
        values.body = input.body;
      }
      if (input.published !== undefined) {
        values.published = input.published;
      }
      if (input.confidential !== undefined) {
        values.confidential = input.confidential;
      }
      await query()
        .updateTable('documents')
        .set(values)
        .where('id', '=', documentId)
        .execute();
      return getView(actor, documentId);
    },

    async remove(actor, documentId) {
      const record = await readVisible(actor, documentId);
      assertWritable(actor);
      assertOwnedOrUnrestricted(actor, record);
      await query()
        .deleteFrom('documentShares')
        .where('documentId', '=', documentId)
        .execute();
      await query()
        .deleteFrom('documents')
        .where('id', '=', documentId)
        .execute();
    },

    async listShares(actor, documentId) {
      await readVisible(actor, documentId);
      assertShareManager(actor);
      const shares = await query()
        .selectFrom('documentShares')
        .selectAll()
        .where('documentId', '=', documentId)
        .orderBy('createdAt', 'asc')
        .execute();
      if (shares.length === 0) {
        return [];
      }
      const userIds = shares.map((share) => String(share.userId));
      const users = await query()
        .selectFrom('user')
        .select(['id', 'name', 'username'])
        .where('id', 'in', userIds)
        .execute();
      const names = new Map(
        users.map((user) => [
          String(user.id),
          toNullableString(user.name ?? user.username),
        ]),
      );
      return shares.map((share) => ({
        documentId: String(share.documentId),
        userId: String(share.userId),
        userName: names.get(String(share.userId)) ?? null,
        createdAt: toIso(share.createdAt),
      }));
    },

    async share(actor, documentId, userId) {
      await readVisible(actor, documentId);
      assertShareManager(actor);
      const user = await query()
        .selectFrom('user')
        .select(['id', 'name', 'username'])
        .where('id', '=', userId)
        .executeTakeFirst();
      if (!user) {
        throw new DocumentNotFoundError(`User ${userId} was not found.`);
      }
      const existing = await query()
        .selectFrom('documentShares')
        .select(['id', 'createdAt'])
        .where('documentId', '=', documentId)
        .where('userId', '=', userId)
        .executeTakeFirst();
      const now = new Date();
      if (!existing) {
        await query()
          .insertInto('documentShares')
          .values({
            id: crypto.randomUUID(),
            documentId,
            userId,
            createdAt: now,
          })
          .execute();
      }
      return {
        documentId,
        userId,
        userName: toNullableString(user.name ?? user.username),
        createdAt: toIso(existing?.createdAt ?? now),
      };
    },

    async revokeShare(actor, documentId, userId) {
      await readVisible(actor, documentId);
      assertShareManager(actor);
      await query()
        .deleteFrom('documentShares')
        .where('documentId', '=', documentId)
        .where('userId', '=', userId)
        .execute();
    },
  };
}
