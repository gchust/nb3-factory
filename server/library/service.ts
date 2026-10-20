import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import { ApiError } from '@nocobase/app-server/router';
import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import {
  AuthorizationDeniedError,
  type AuthorizationDecision,
} from '@nocobase/authorization/core';
import { randomUUID } from 'node:crypto';

import {
  LIBRARY_RESOURCE_ID,
  type LibraryDocumentRecord,
} from './resources.js';

export interface LibraryDocumentView {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  ownerName: string;
  published: boolean;
  confidential: boolean;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface LibraryShareView {
  id: string;
  documentId: string;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
}

export interface LibraryAdminDocument extends LibraryDocumentView {
  shares: LibraryShareView[];
}

export interface LibraryPage<T> {
  rows: T[];
  total: number;
}

export interface PageInput {
  page: number;
  pageSize: number;
}

export interface LibraryAdminUser {
  id: string;
  name: string;
  email: string;
}

export interface CreateDocumentInput {
  title: string;
  body: string;
  published: boolean;
  confidential: boolean;
}

export interface UpdateDocumentInput {
  title?: string;
  body?: string;
  published?: boolean;
  confidential?: boolean;
}

function denied(): ApiError {
  return new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'LIBRARY_ACCESS_DENIED',
    domain: 'library',
    message: 'The document library does not allow this operation.',
  });
}

function notFound(documentId: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'LIBRARY_DOCUMENT_NOT_FOUND',
    domain: 'library',
    message: `Document ${documentId} was not found.`,
  });
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

async function compositePolicy(
  authorization: AuthorizationContext,
  action: string,
): Promise<RepositoryPolicy> {
  const decision = await authorization.authorize({
    resource: { type: 'composite', id: LIBRARY_RESOURCE_ID },
    action,
  });
  const policies = decision.conditions?.database as
    Record<string, RepositoryPolicy | undefined> | undefined;
  const policy = policies?.documents;
  if (decision.effect === 'deny' || !policy) {
    throw new AuthorizationDeniedError(decision);
  }
  return policy;
}

function canUse(decision: AuthorizationDecision): boolean {
  const policies = decision.conditions?.database as
    Record<string, RepositoryPolicy | undefined> | undefined;
  return decision.effect !== 'deny' && Boolean(policies?.documents);
}

/**
 * A policy-bound Repository reports `Partial<T>` because the read policy may
 * limit fields. The composite policy always allows every document field, so
 * the row is complete; this guard fails loudly instead of pretending later.
 */
function complete(
  record: Partial<LibraryDocumentRecord>,
): LibraryDocumentRecord {
  if (
    typeof record.id !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.body !== 'string' ||
    typeof record.ownerId !== 'string' ||
    typeof record.published !== 'boolean' ||
    typeof record.confidential !== 'boolean'
  ) {
    throw new Error('The document row is missing a required field.');
  }
  return record as LibraryDocumentRecord;
}

/**
 * The document library's business service. Every read and write is bound to the
 * policy of the business action that allowed it, so a record the caller may not
 * see never reaches the result and a field the action may not write is refused
 * by the Repository rather than trusted from the browser.
 */
export class LibraryService {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly authorization: AuthorizationContext,
  ) {}

  public async listDocuments(
    page: PageInput,
  ): Promise<LibraryPage<LibraryDocumentView>> {
    const policy = await compositePolicy(this.authorization, 'view');
    const [edit, remove] = await Promise.all([
      this.authorization.authorize({
        resource: { type: 'composite', id: LIBRARY_RESOURCE_ID },
        action: 'edit',
      }),
      this.authorization.authorize({
        resource: { type: 'composite', id: LIBRARY_RESOURCE_ID },
        action: 'delete',
      }),
    ]);
    const repository = this.database
      .repository<LibraryDocumentRecord>('documents')
      .withPolicy(policy);
    const [records, total] = await Promise.all([
      repository.findMany({
        limit: page.pageSize,
        offset: (page.page - 1) * page.pageSize,
        sort: (sort) => sort.field('createdAt').desc(),
      }),
      repository.count(),
    ]);
    const completeRecords = records.map(complete);
    const names = await this.ownerNames(
      completeRecords.map((record) => record.ownerId),
    );
    return {
      rows: completeRecords.map((record) =>
        this.present(
          record,
          names.get(record.ownerId) ?? record.ownerId,
          this.canChange(record, edit),
          this.canChange(record, remove),
        ),
      ),
      total,
    };
  }

  public async getDocument(documentId: string): Promise<LibraryDocumentView> {
    const policy = await compositePolicy(this.authorization, 'view');
    const [edit, remove] = await Promise.all([
      this.authorization.authorize({
        resource: { type: 'composite', id: LIBRARY_RESOURCE_ID },
        action: 'edit',
      }),
      this.authorization.authorize({
        resource: { type: 'composite', id: LIBRARY_RESOURCE_ID },
        action: 'delete',
      }),
    ]);
    const record = await this.database
      .repository<LibraryDocumentRecord>('documents')
      .withPolicy(policy)
      .findOne({ filter: { id: documentId } });
    if (!record) throw notFound(documentId);
    const document = complete(record);
    const names = await this.ownerNames([document.ownerId]);
    return this.present(
      document,
      names.get(document.ownerId) ?? document.ownerId,
      this.canChange(document, edit),
      this.canChange(document, remove),
    );
  }

  public async createDocument(
    input: CreateDocumentInput,
  ): Promise<LibraryDocumentView> {
    const policy = await compositePolicy(this.authorization, 'create');
    if (this.authorization.identity.principal.type !== 'user') throw denied();
    const userId = this.authorization.identity.principal.id;
    const now = new Date();
    const id = randomUUID();
    await this.database
      .repository<LibraryDocumentRecord>('documents')
      .withPolicy(policy)
      .createOne({
        values: {
          id,
          title: input.title,
          body: input.body,
          ownerId: userId,
          published: input.published,
          confidential: input.confidential,
          createdAt: now,
          updatedAt: now,
        },
      });
    return this.getDocument(id);
  }

  public async updateDocument(
    documentId: string,
    input: UpdateDocumentInput,
  ): Promise<LibraryDocumentView> {
    const policy = await compositePolicy(this.authorization, 'edit');
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) values.title = input.title;
    if (input.body !== undefined) values.body = input.body;
    if (input.published !== undefined) values.published = input.published;
    if (input.confidential !== undefined) {
      values.confidential = input.confidential;
    }
    await this.database
      .repository<LibraryDocumentRecord>('documents')
      .withPolicy(policy)
      .updateOne({
        filter: { id: documentId },
        values,
      });
    return this.getDocument(documentId);
  }

  public async deleteDocument(documentId: string): Promise<void> {
    const policy = await compositePolicy(this.authorization, 'delete');
    await this.database.transaction(async (connection) => {
      await connection
        .repository<LibraryDocumentRecord>('documents')
        .withPolicy(policy)
        .deleteOne({ filter: { id: documentId } });
      // The foreign key cascades too; this keeps a connection with cascades
      // disabled from leaving a share that outlives its document.
      await connection.query
        .deleteFrom('documentShares')
        .where('documentId', '=', documentId)
        .execute();
    });
  }

  /** Administration reads every document, including confidential drafts. */
  public async listAdminDocuments(
    page: PageInput,
  ): Promise<LibraryPage<LibraryAdminDocument>> {
    const [edit, remove] = await Promise.all([
      this.authorization.authorize({
        resource: { type: 'composite', id: LIBRARY_RESOURCE_ID },
        action: 'edit',
      }),
      this.authorization.authorize({
        resource: { type: 'composite', id: LIBRARY_RESOURCE_ID },
        action: 'delete',
      }),
    ]);
    const [records, total] = await Promise.all([
      this.database
        .query()
        .selectFrom('documents')
        .selectAll()
        .orderBy('createdAt', 'desc')
        .limit(page.pageSize)
        .offset((page.page - 1) * page.pageSize)
        .execute(),
      this.database.repository<LibraryDocumentRecord>('documents').count(),
    ]);
    const documentIds = records.map((record) => String(record.id));
    const shares = documentIds.length
      ? await this.database
          .query()
          .selectFrom('documentShares')
          .selectAll()
          .where('documentId', 'in', documentIds)
          .orderBy('createdAt', 'asc')
          .execute()
      : [];
    const userIds = [
      ...new Set([
        ...records.map((record) => String(record.ownerId)),
        ...shares.map((share) => String(share.userId)),
      ]),
    ];
    const people = new Map(
      (userIds.length
        ? await this.database
            .query()
            .selectFrom('user')
            .select(['id', 'name', 'email'])
            .where('id', 'in', userIds)
            .execute()
        : []
      ).map((user) => [String(user.id), user]),
    );
    const sharesByDocument = new Map<string, LibraryShareView[]>();
    for (const share of shares) {
      const user = people.get(String(share.userId));
      const list = sharesByDocument.get(String(share.documentId)) ?? [];
      list.push({
        id: String(share.id),
        documentId: String(share.documentId),
        userId: String(share.userId),
        userName:
          typeof user?.name === 'string' ? user.name : String(share.userId),
        userEmail: typeof user?.email === 'string' ? user.email : '',
        createdAt: iso(share.createdAt as string | Date),
      });
      sharesByDocument.set(String(share.documentId), list);
    }
    return {
      rows: records.map((record) => ({
        ...this.present(
          record as unknown as LibraryDocumentRecord,
          String(people.get(String(record.ownerId))?.name ?? record.ownerId),
          this.canChange(record as unknown as LibraryDocumentRecord, edit),
          this.canChange(record as unknown as LibraryDocumentRecord, remove),
        ),
        shares: sharesByDocument.get(String(record.id)) ?? [],
      })),
      total,
    };
  }

  public async listAdminUsers(): Promise<LibraryAdminUser[]> {
    const users = await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'email'])
      .where('kind', '=', 'person')
      .where('disabledAt', 'is', null)
      .where('deletedAt', 'is', null)
      .orderBy('name', 'asc')
      .execute();
    return users.map((user) => ({
      id: String(user.id),
      name: String(user.name),
      email: String(user.email),
    }));
  }

  public async createShare(
    documentId: string,
    userId: string,
  ): Promise<LibraryShareView> {
    const [document, user, existing] = await Promise.all([
      this.database
        .query()
        .selectFrom('documents')
        .select(['id', 'confidential'])
        .where('id', '=', documentId)
        .executeTakeFirst(),
      this.database
        .query()
        .selectFrom('user')
        .select(['id', 'name', 'email', 'kind', 'disabledAt', 'deletedAt'])
        .where('id', '=', userId)
        .executeTakeFirst(),
      this.database
        .query()
        .selectFrom('documentShares')
        .select('id')
        .where('documentId', '=', documentId)
        .where('userId', '=', userId)
        .executeTakeFirst(),
    ]);
    if (!document) throw notFound(documentId);
    if (
      !user ||
      user.kind !== 'person' ||
      user.disabledAt !== null ||
      user.deletedAt !== null
    ) {
      throw new ApiError({
        status: 'INVALID_ARGUMENT',
        reason: 'LIBRARY_SHARE_USER_INVALID',
        domain: 'library',
        message: 'A share needs an enabled person account.',
        fieldViolations: [
          {
            field: 'userId',
            description: 'The user is not an enabled person.',
          },
        ],
      });
    }
    if (document.confidential) {
      throw new ApiError({
        status: 'FAILED_PRECONDITION',
        reason: 'LIBRARY_DOCUMENT_CONFIDENTIAL',
        domain: 'library',
        message: 'A confidential document cannot be shared.',
      });
    }
    if (existing) {
      throw new ApiError({
        status: 'ALREADY_EXISTS',
        reason: 'LIBRARY_SHARE_EXISTS',
        domain: 'library',
        message: 'That person already has access to this document.',
      });
    }
    const now = new Date();
    const id = randomUUID();
    await this.database
      .query()
      .insertInto('documentShares')
      .values({
        id,
        documentId,
        userId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return {
      id,
      documentId,
      userId,
      userName: String(user.name),
      userEmail: String(user.email),
      createdAt: now.toISOString(),
    };
  }

  public async deleteShare(shareId: string): Promise<void> {
    const existing = await this.database
      .query()
      .selectFrom('documentShares')
      .select('id')
      .where('id', '=', shareId)
      .executeTakeFirst();
    if (!existing) {
      throw new ApiError({
        status: 'NOT_FOUND',
        reason: 'LIBRARY_SHARE_NOT_FOUND',
        domain: 'library',
        message: `Share ${shareId} was not found.`,
      });
    }
    await this.database
      .query()
      .deleteFrom('documentShares')
      .where('id', '=', shareId)
      .execute();
  }

  /** Editing and deleting are granted per action, but the business rule is per owner. */
  private canChange(
    record: LibraryDocumentRecord,
    decision: AuthorizationDecision,
  ): boolean {
    const principal = this.authorization.identity.principal;
    return (
      principal.type === 'user' &&
      principal.id === record.ownerId &&
      canUse(decision)
    );
  }

  private present(
    record: LibraryDocumentRecord,
    ownerName: string,
    canEdit: boolean,
    canDelete: boolean,
  ): LibraryDocumentView {
    return {
      id: String(record.id),
      title: String(record.title),
      body: String(record.body ?? ''),
      ownerId: String(record.ownerId),
      ownerName,
      published: Boolean(record.published),
      confidential: Boolean(record.confidential),
      createdAt: iso(record.createdAt),
      updatedAt: iso(record.updatedAt),
      canEdit,
      canDelete,
    };
  }

  private async ownerNames(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const users = await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'name'])
      .where('id', 'in', unique)
      .execute();
    return new Map(
      users.map((user) => [String(user.id), String(user.name)] as const),
    );
  }
}
