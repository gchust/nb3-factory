import type { DatabaseManager } from '@nocobase/db';

import { canEdit, canShare, isVisible } from './policy.js';
import type {
  DocumentInput,
  DocumentRecord,
  DocumentRequester,
  DocumentShareView,
  DocumentView,
} from './types.js';

/** A failure the route turns into an HTTP error. The service never decides status codes. */
export class LibraryError extends Error {
  constructor(
    readonly code:
      | 'DOCUMENT_NOT_FOUND'
      | 'NOT_DOCUMENT_OWNER'
      | 'CONFIDENTIAL_DOCUMENT'
      | 'USER_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'LibraryError';
  }
}

interface UserSummary {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/**
 * The library's documents and their temporary shares.
 *
 * Visibility is decided here rather than by the caller: the service loads the documents the requester may see, refuses
 * the ones they may not, and answers every row with the `canEdit` its owner check implies. Routes only translate the
 * failures into responses.
 */
export class LibraryService {
  constructor(private readonly database: DatabaseManager) {}

  private get query() {
    return this.database.query();
  }

  private async sharedIds(requester: DocumentRequester): Promise<Set<string>> {
    if (requester.unrestricted) return new Set();
    const rows = await this.query
      .selectFrom('documentShares')
      .select('documentId')
      .where('userId', '=', requester.userId)
      .execute();
    return new Set(rows.map((row) => String(row.documentId)));
  }

  /** Every document the requester may see, newest first. */
  async list(requester: DocumentRequester): Promise<DocumentView[]> {
    const shared = await this.sharedIds(requester);
    // The query builder is immutable: `where` returns a new query, so it has to be reassigned.
    let query = this.query
      .selectFrom('documents')
      .selectAll()
      .orderBy('createdAt', 'desc');

    if (!requester.unrestricted) {
      const sharedIds = [...shared];
      query = query.where((eb) =>
        eb.or([
          eb('ownerId', '=', requester.userId),
          eb.and([eb('published', '=', true), eb('confidential', '=', false)]),
          ...(sharedIds.length
            ? [
                eb.and([
                  eb('confidential', '=', false),
                  eb('id', 'in', sharedIds),
                ]),
              ]
            : []),
        ]),
      );
    }

    const rows = await query.execute<DocumentRecord>();
    return this.toViews(rows, requester, shared);
  }

  /** One document, or `undefined` when it does not exist or the requester may not see it. */
  async get(
    requester: DocumentRequester,
    documentId: string,
  ): Promise<DocumentView | undefined> {
    const row = await this.load(documentId);
    if (!row) return undefined;
    const shared = await this.sharedIds(requester);
    if (!isVisible(row, requester, shared)) return undefined;
    return (await this.toViews([row], requester, shared))[0];
  }

  async create(
    requester: DocumentRequester,
    input: DocumentInput,
  ): Promise<DocumentView> {
    const now = new Date();
    const row: DocumentRecord = {
      id: crypto.randomUUID(),
      title: input.title ?? '',
      body: input.body ?? null,
      published: input.published ?? false,
      confidential: input.confidential ?? false,
      ownerId: requester.userId,
      createdAt: now,
      updatedAt: now,
    };
    await this.query.insertInto('documents').values(row).execute();
    return (await this.toViews([row], requester, new Set()))[0];
  }

  async update(
    requester: DocumentRequester,
    documentId: string,
    input: DocumentInput,
  ): Promise<DocumentView> {
    const row = await this.loadVisible(requester, documentId);
    if (!canEdit(row, requester)) {
      throw new LibraryError(
        'NOT_DOCUMENT_OWNER',
        'Only the owner may change this document.',
      );
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.body !== undefined) patch.body = input.body;
    if (input.published !== undefined) patch.published = input.published;
    if (input.confidential !== undefined)
      patch.confidential = input.confidential;
    await this.query
      .updateTable('documents')
      .set(patch)
      .where('id', '=', documentId)
      .execute();

    const updated = (await this.load(documentId)) ?? row;
    const shared = await this.sharedIds(requester);
    return (await this.toViews([updated], requester, shared))[0];
  }

  async remove(
    requester: DocumentRequester,
    documentId: string,
  ): Promise<void> {
    const row = await this.loadVisible(requester, documentId);
    if (!canEdit(row, requester)) {
      throw new LibraryError(
        'NOT_DOCUMENT_OWNER',
        'Only the owner may delete this document.',
      );
    }
    await this.query
      .deleteFrom('documents')
      .where('id', '=', documentId)
      .execute();
    await this.query
      .deleteFrom('documentShares')
      .where('documentId', '=', documentId)
      .execute();
  }

  /** The people a document is currently shared with. */
  async listShares(documentId: string): Promise<DocumentShareView[]> {
    await this.requireDocument(documentId);
    const rows = await this.query
      .selectFrom('documentShares')
      .select(['userId', 'createdAt'])
      .where('documentId', '=', documentId)
      .orderBy('createdAt', 'asc')
      .execute();
    const users = await this.users(rows.map((row) => String(row.userId)));
    return rows.map((row) => {
      const user = users.get(String(row.userId));
      return {
        userId: String(row.userId),
        name: user?.name ?? null,
        username: user?.username ?? null,
        email: user?.email ?? null,
        createdAt: toIso(row.createdAt as Date | string),
      };
    });
  }

  /** Open one document to one person. Sharing the same document twice is the same share. */
  async addShare(
    requester: DocumentRequester,
    documentId: string,
    userId: string,
  ): Promise<DocumentShareView> {
    const document = await this.requireDocument(documentId);
    if (!canShare(document, requester)) {
      throw new LibraryError(
        'CONFIDENTIAL_DOCUMENT',
        'A confidential document cannot be shared with anyone but its owner.',
      );
    }
    const user = (await this.users([userId])).get(userId);
    if (!user) throw new LibraryError('USER_NOT_FOUND', 'Unknown user.');

    const existing = await this.query
      .selectFrom('documentShares')
      .select('documentId')
      .where('documentId', '=', documentId)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (!existing) {
      await this.query
        .insertInto('documentShares')
        .values({
          id: crypto.randomUUID(),
          documentId,
          userId,
          createdAt: new Date(),
        })
        .execute();
    }

    const row = await this.query
      .selectFrom('documentShares')
      .select('createdAt')
      .where('documentId', '=', documentId)
      .where('userId', '=', userId)
      .executeTakeFirst<{ createdAt: Date | string }>();
    return {
      userId,
      name: user.name,
      username: user.username,
      email: user.email,
      createdAt: toIso(row?.createdAt ?? new Date()),
    };
  }

  /** Close a share. Revoking a share that is not there leaves the document as it was. */
  async removeShare(documentId: string, userId: string): Promise<void> {
    await this.requireDocument(documentId);
    await this.query
      .deleteFrom('documentShares')
      .where('documentId', '=', documentId)
      .where('userId', '=', userId)
      .execute();
  }

  private async requireDocument(documentId: string): Promise<DocumentRecord> {
    const row = await this.load(documentId);
    if (!row) throw new LibraryError('DOCUMENT_NOT_FOUND', 'Unknown document.');
    return row;
  }

  private async load(documentId: string): Promise<DocumentRecord | undefined> {
    return this.query
      .selectFrom('documents')
      .selectAll()
      .where('id', '=', documentId)
      .executeTakeFirst<DocumentRecord>();
  }

  private async loadVisible(
    requester: DocumentRequester,
    documentId: string,
  ): Promise<DocumentRecord> {
    const row = await this.load(documentId);
    const shared = await this.sharedIds(requester);
    if (!row || !isVisible(row, requester, shared)) {
      throw new LibraryError('DOCUMENT_NOT_FOUND', 'Unknown document.');
    }
    return row;
  }

  private async users(ids: string[]): Promise<Map<string, UserSummary>> {
    const unique = [...new Set(ids)].filter((id) => id.length > 0);
    const result = new Map<string, UserSummary>();
    if (!unique.length) return result;
    const rows = await this.query
      .selectFrom('user')
      .select(['id', 'name', 'username', 'email'])
      .where('id', 'in', unique)
      .execute<UserSummary>();
    for (const row of rows) result.set(row.id, row);
    return result;
  }

  private async toViews(
    rows: DocumentRecord[],
    requester: DocumentRequester,
    shared: ReadonlySet<string>,
  ): Promise<DocumentView[]> {
    const users = await this.users(rows.map((row) => row.ownerId));
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      published: Boolean(row.published),
      confidential: Boolean(row.confidential),
      ownerId: row.ownerId,
      ownerName: users.get(row.ownerId)?.name ?? null,
      canEdit: canEdit(row, requester),
      shared: !requester.unrestricted && shared.has(row.id),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    }));
  }
}
