import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type {
  DatabaseConnection,
  DatabaseManager,
  RepositoryPolicy,
  RepositoryRecord,
} from '@nocobase/db';
import type { RecordSelection } from '@nocobase/authorization/core';
import type {
  SharingRule,
  SharingRulesApi,
  SharingRulesAuthorizationApi,
} from '@nocobase/authorization/sharing-rules';
import { DOCUMENTS_COLLECTION, LIBRARY_RECORD_ACCESS } from './scope.js';

/** The authorization surface the library uses beyond the application's own. */
export type LibraryAuthorization = AppAuthorization &
  SharingRulesAuthorizationApi<DatabaseConnection>;

/** The settings item the built-in sharing-rule endpoints are gated by. */
export const SHARING_RULES_SETTINGS = 'authorization.sharing-rules';

/** Marks the sharing rules this application created, so listing is scoped. */
const SHARE_KEY_PREFIX = 'library-share-';

export interface LibraryActor {
  readonly userId: string;
  readonly authz: AuthorizationContext;
}

export interface LibraryDocument {
  id: number;
  title: string;
  content: string | null;
  ownerId: string;
  ownerName: string | null;
  published: boolean;
  confidential: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /** Whether this particular row is inside the actor's update scope. */
  canEdit: boolean;
  /** Whether this particular row is inside the actor's delete scope. */
  canDelete: boolean;
}

export interface LibraryDocumentList {
  items: LibraryDocument[];
  canRead: boolean;
  canCreate: boolean;
  canShare: boolean;
}

export interface LibraryDocumentInput {
  title: string;
  content?: string | null;
  published?: boolean;
  confidential?: boolean;
}

export interface LibraryShare {
  key: string;
  documentId: number;
  documentTitle: string | null;
  recipientId: string;
  recipientName: string | null;
  createdAt: string | null;
}

export interface LibraryRecipient {
  id: string;
  name: string;
  username: string | null;
}

export type LibraryErrorStatus = 400 | 403 | 404;

export class LibraryError extends Error {
  readonly status: LibraryErrorStatus;
  readonly code: string;

  constructor(code: string, message: string, status: LibraryErrorStatus = 400) {
    super(message);
    this.name = 'LibraryError';
    this.code = code;
    this.status = status;
  }
}

function repositoryErrorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

/** Turns a scope or field rejection from the repository into an HTTP-shaped error. */
function translateRepositoryError(error: unknown): LibraryError {
  const code = repositoryErrorCode(error);
  if (code === undefined || !code.endsWith('_FORBIDDEN')) {
    if (code === 'RECORD_NOT_FOUND' || code === 'RECORD_OUTSIDE_SCOPE') {
      return new LibraryError('DOCUMENT_NOT_FOUND', 'Document not found', 404);
    }
    return new LibraryError(
      'LIBRARY_WRITE_FAILED',
      error instanceof Error ? error.message : 'The operation failed',
      400,
    );
  }
  return new LibraryError(
    'LIBRARY_FORBIDDEN',
    'This account may not perform that operation',
    403,
  );
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/**
 * What a bound write policy means for a single row.
 *
 * `true` writes every row, `false` writes none, and any bound scope leaves the
 * decision to the row. The library binds one scope for writes — `recordsIOwn` —
 * so a bound policy is reported as `'owner'` and the row's owner is compared
 * to the actor. Reading is separate: a reader's policy has no update scope at
 * all and lands on `false`.
 */
function writeScope(
  node: RepositoryPolicy['update'] | RepositoryPolicy['delete'],
): boolean | 'owner' {
  if (node === true) return true;
  if (node === false) return false;
  return 'owner';
}

/**
 * The library's domain logic. HTTP concerns stay in the route; every read and
 * write goes through the authorization-bound Repository, so the record scope
 * and field allowlist of the actor's Permission Sets are enforced by the
 * database layer rather than re-implemented here.
 */
export class LibraryService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly authorization: LibraryAuthorization,
  ) {}

  private policyFor(actor: LibraryActor) {
    return this.authorization.database.policyFor(
      DOCUMENTS_COLLECTION,
      actor.authz,
    );
  }

  private async canShare(actor: LibraryActor): Promise<boolean> {
    return actor.authz.can({
      resource: { type: 'settings', id: SHARING_RULES_SETTINGS },
      action: 'read',
    });
  }

  private async ownerNames(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .where('id', 'in', unique)
      .execute();
    return new Map(
      rows.map((row) => [
        String(row.id),
        String(row.name ?? row.username ?? row.id),
      ]),
    );
  }

  private toDocument(
    row: Record<string, unknown>,
    ownerNames: Map<string, string>,
    actor: LibraryActor,
    canUpdate: boolean | 'owner',
    canDelete: boolean | 'owner',
  ): LibraryDocument {
    const ownerId = String(row.ownerId);
    const owner = ownerId === actor.userId;
    return {
      id: Number(row.id),
      title: String(row.title),
      content: toStringOrNull(row.content),
      ownerId,
      ownerName: ownerNames.get(ownerId) ?? null,
      published: Boolean(row.published),
      confidential: Boolean(row.confidential),
      createdAt: toStringOrNull(row.createdAt),
      updatedAt: toStringOrNull(row.updatedAt),
      canEdit: canUpdate === true || (canUpdate === 'owner' && owner),
      canDelete: canDelete === true || (canDelete === 'owner' && owner),
    };
  }

  async listDocuments(actor: LibraryActor): Promise<LibraryDocumentList> {
    const policy = await this.policyFor(actor);
    const canRead = policy.read !== false;
    const canShare = await this.canShare(actor);
    if (!canRead) {
      return { items: [], canRead: false, canCreate: false, canShare };
    }

    const repository = this.database
      .repository(DOCUMENTS_COLLECTION)
      .withPolicy(policy);
    const rows = (await repository.findMany({
      limit: 500,
    })) as unknown as Record<string, unknown>[];
    const ownerNames = await this.ownerNames(
      rows.map((row) => String(row.ownerId)),
    );
    const updateScope = writeScope(policy.update);
    const deleteScope = writeScope(policy.delete);
    const items = rows
      .map((row) =>
        this.toDocument(row, ownerNames, actor, updateScope, deleteScope),
      )
      .sort((left, right) => {
        const at = left.updatedAt ?? '';
        const bt = right.updatedAt ?? '';
        return at === bt ? right.id - left.id : bt.localeCompare(at);
      });

    return {
      items,
      canRead: true,
      canCreate: policy.create !== false,
      canShare,
    };
  }

  async getDocument(actor: LibraryActor, id: number): Promise<LibraryDocument> {
    const policy = await this.policyFor(actor);
    if (policy.read === false) {
      throw new LibraryError(
        'LIBRARY_FORBIDDEN',
        'Reading is not permitted',
        403,
      );
    }
    const repository = this.database
      .repository(DOCUMENTS_COLLECTION)
      .withPolicy(policy);
    const row = await repository.findOne({ filter: { id } });
    if (!row) {
      throw new LibraryError('DOCUMENT_NOT_FOUND', 'Document not found', 404);
    }
    const record = row as unknown as Record<string, unknown>;
    const ownerNames = await this.ownerNames([String(record.ownerId)]);
    return this.toDocument(
      record,
      ownerNames,
      actor,
      writeScope(policy.update),
      writeScope(policy.delete),
    );
  }

  async createDocument(
    actor: LibraryActor,
    input: LibraryDocumentInput,
  ): Promise<LibraryDocument> {
    const title = input.title?.trim();
    if (!title) {
      throw new LibraryError('INVALID_TITLE', 'A title is required', 400);
    }
    const policy = await this.policyFor(actor);
    if (policy.create === false) {
      throw new LibraryError(
        'LIBRARY_FORBIDDEN',
        'Creating is not permitted',
        403,
      );
    }
    const repository = this.database
      .repository(DOCUMENTS_COLLECTION)
      .withPolicy(policy);
    const now = new Date();
    try {
      const result = await repository.createOne({
        values: {
          title,
          content: input.content ?? null,
          ownerId: actor.userId,
          published: input.published === true,
          confidential: input.confidential === true,
          createdAt: now,
          updatedAt: now,
        },
      });
      return this.getDocument(actor, Number(result.record.id));
    } catch (error) {
      throw translateRepositoryError(error);
    }
  }

  async updateDocument(
    actor: LibraryActor,
    id: number,
    input: Partial<LibraryDocumentInput>,
  ): Promise<LibraryDocument> {
    const policy = await this.policyFor(actor);
    if (policy.update === false) {
      throw new LibraryError(
        'LIBRARY_FORBIDDEN',
        'Updating is not permitted',
        403,
      );
    }
    const values: Partial<RepositoryRecord> = { updatedAt: new Date() };
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) {
        throw new LibraryError('INVALID_TITLE', 'A title is required', 400);
      }
      values.title = title;
    }
    if (input.content !== undefined) values.content = input.content ?? null;
    if (input.published !== undefined)
      values.published = input.published === true;
    if (input.confidential !== undefined) {
      values.confidential = input.confidential === true;
    }

    const repository = this.database
      .repository(DOCUMENTS_COLLECTION)
      .withPolicy(policy);
    try {
      await repository.updateOne({ filter: { id }, values });
    } catch (error) {
      throw translateRepositoryError(error);
    }
    return this.getDocument(actor, id);
  }

  async deleteDocument(actor: LibraryActor, id: number): Promise<void> {
    const policy = await this.policyFor(actor);
    if (policy.delete === false) {
      throw new LibraryError(
        'LIBRARY_FORBIDDEN',
        'Deleting is not permitted',
        403,
      );
    }
    const repository = this.database
      .repository(DOCUMENTS_COLLECTION)
      .withPolicy(policy);
    try {
      await repository.deleteOne({ filter: { id } });
    } catch (error) {
      throw translateRepositoryError(error);
    }
  }

  private sharingRules(): SharingRulesApi<DatabaseConnection> {
    return this.authorization.sharingRules;
  }

  async listShares(actor: LibraryActor): Promise<LibraryShare[]> {
    void actor;
    const rules = await this.sharingRules().list();
    const owned = rules.filter((rule) => rule.key.startsWith(SHARE_KEY_PREFIX));
    const documents = await this.documentTitles(
      owned
        .map((rule) => this.sharedDocumentId(rule))
        .filter((id): id is number => id !== undefined),
    );
    const recipients = await this.ownerNames(
      owned.flatMap((rule) => rule.subjects.map((subject) => subject.id)),
    );
    return owned
      .map((rule) => {
        const documentId = this.sharedDocumentId(rule);
        return {
          key: rule.key,
          documentId: documentId ?? 0,
          documentTitle:
            documentId === undefined
              ? null
              : (documents.get(documentId) ?? null),
          recipientId: rule.subjects[0]?.id ?? '',
          recipientName: recipients.get(rule.subjects[0]?.id ?? '') ?? null,
          createdAt: null,
        };
      })
      .filter((share) => share.documentId !== 0)
      .sort((left, right) => right.documentId - left.documentId);
  }

  async createShare(
    actor: LibraryActor,
    documentId: number,
    recipientIds: readonly string[],
  ): Promise<LibraryShare[]> {
    void actor;
    if (!Number.isInteger(documentId) || documentId <= 0) {
      throw new LibraryError('INVALID_DOCUMENT', 'A document is required', 400);
    }
    const recipients = [...new Set(recipientIds.filter((id) => !!id))];
    if (recipients.length === 0) {
      throw new LibraryError(
        'INVALID_RECIPIENT',
        'A recipient is required',
        400,
      );
    }

    const document = await this.database
      .query()
      .selectFrom(DOCUMENTS_COLLECTION)
      .select(['id', 'title'])
      .where('id', '=', documentId)
      .executeTakeFirst();
    if (!document) {
      throw new LibraryError('DOCUMENT_NOT_FOUND', 'Document not found', 404);
    }

    const users = await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'disabledAt'])
      .where('id', 'in', recipients)
      .execute();
    const enabled = new Set(
      users.filter((user) => !user.disabledAt).map((user) => String(user.id)),
    );

    const created: LibraryShare[] = [];
    for (const recipientId of recipients) {
      if (!enabled.has(recipientId)) {
        throw new LibraryError(
          'INVALID_RECIPIENT',
          `Recipient ${recipientId} is unavailable`,
          400,
        );
      }
      const key = `${SHARE_KEY_PREFIX}${documentId}-${recipientId}`;
      const existing = await this.sharingRules().get(key);
      if (existing) {
        created.push(this.toShare(existing, String(document.title)));
        continue;
      }
      const selection: RecordSelection = {
        type: 'recordAccess',
        key: LIBRARY_RECORD_ACCESS.sharedDocument,
        params: { documentId },
      };
      const rule = await this.sharingRules().create({
        key,
        resource: { type: 'database.collection', id: DOCUMENTS_COLLECTION },
        actions: [{ action: 'read', selection }],
        title: {
          key: 'library.sharingRules.temporary',
          ns: 'nb3-factory',
        },
        subjects: [{ type: 'user', id: recipientId }],
        reason: `临时开放资料 #${documentId} 给 ${recipientId}`,
      });
      created.push(this.toShare(rule, String(document.title)));
    }
    return created;
  }

  async deleteShare(actor: LibraryActor, key: string): Promise<void> {
    void actor;
    if (!key.startsWith(SHARE_KEY_PREFIX)) {
      throw new LibraryError(
        'SHARE_NOT_FOUND',
        'That sharing rule is not managed here',
        404,
      );
    }
    const existing = await this.sharingRules().get(key);
    if (!existing) {
      throw new LibraryError('SHARE_NOT_FOUND', 'Share not found', 404);
    }
    await this.sharingRules().delete(key);
  }

  async listRecipients(actor: LibraryActor): Promise<LibraryRecipient[]> {
    void actor;
    const rows = await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'username', 'disabledAt'])
      .where('disabledAt', 'is', null)
      .execute();
    return rows
      .map((row) => ({
        id: String(row.id),
        name: String(row.name ?? row.username ?? row.id),
        username: toStringOrNull(row.username),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private toShare(
    rule: SharingRule,
    documentTitle: string | null,
  ): LibraryShare {
    return {
      key: rule.key,
      documentId: this.sharedDocumentId(rule) ?? 0,
      documentTitle,
      recipientId: rule.subjects[0]?.id ?? '',
      recipientName: null,
      createdAt: null,
    };
  }

  private sharedDocumentId(rule: SharingRule): number | undefined {
    for (const action of rule.actions) {
      const selection = action.selection;
      if (
        selection.type !== 'recordAccess' ||
        selection.key !== LIBRARY_RECORD_ACCESS.sharedDocument
      ) {
        continue;
      }
      const params = selection.params;
      if (params === null || typeof params !== 'object') continue;
      const raw = (params as { documentId?: unknown }).documentId;
      const parsed = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isSafeInteger(parsed)) return parsed;
    }
    return undefined;
  }

  private async documentTitles(
    ids: readonly number[],
  ): Promise<Map<number, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.database
      .query()
      .selectFrom(DOCUMENTS_COLLECTION)
      .select(['id', 'title'])
      .where('id', 'in', unique)
      .execute();
    return new Map(rows.map((row) => [Number(row.id), String(row.title)]));
  }
}
