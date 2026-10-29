import { randomUUID } from 'node:crypto';

import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { ApiError } from '@nocobase/app-server/router';
import {
  selection,
  type AuthorizationContext,
  type AuthorizationDecision,
} from '@nocobase/authorization/core';
import { defineSharingRule } from '@nocobase/authorization/sharing-rules';
import type {
  SharingRule,
  SharingRulesAuthorizationApi,
} from '@nocobase/authorization/sharing-rules';
import {
  RepositoryError,
  type DatabaseConnection,
  type DatabaseManager,
  type RepositoryPolicy,
} from '@nocobase/db';

import {
  DOCUMENTS_COLLECTION,
  DOCUMENTS_RESOURCE,
  DOCUMENTS_SCOPE,
  type DocumentsAction,
} from '../documents/constants.js';
import { documents, label, type DocumentRow } from '../documents/resources.js';

const DOMAIN = 'documents';
const SHARE_KEY_PREFIX = 'document-share';

export interface PublicDocument {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly canEdit: boolean;
}

export interface DocumentShare {
  readonly userId: string;
  readonly name: string;
  readonly username: string | null;
}

export interface AdminDocument {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly shares: readonly DocumentShare[];
}

export interface SharingRecipient {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
}

export interface CreateDocumentInput {
  readonly title: string;
  readonly content: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

export interface UpdateDocumentInput {
  readonly title?: string;
  readonly content?: string;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

type DocumentsAuthorization = AppAuthorization &
  SharingRulesAuthorizationApi<DatabaseConnection>;

function apiError(
  status:
    | 'UNAUTHENTICATED'
    | 'PERMISSION_DENIED'
    | 'NOT_FOUND'
    | 'FAILED_PRECONDITION',
  reason: string,
  message: string,
): ApiError {
  return new ApiError({ status, reason, domain: DOMAIN, message });
}

export function accessDenied(): ApiError {
  return apiError(
    'PERMISSION_DENIED',
    'DOCUMENTS_ACCESS_DENIED',
    'The signed-in user may not perform this document action.',
  );
}

export function documentNotFound(): ApiError {
  return apiError(
    'NOT_FOUND',
    'DOCUMENT_NOT_FOUND',
    "The document does not exist or is outside the caller's data scope.",
  );
}

export function shareKey(documentId: string, userId: string): string {
  return `${SHARE_KEY_PREFIX}-${documentId}-user-${userId}`;
}

/**
 * The document library's domain logic. Every read and write goes through the
 * repository policy derived from the request's composite-resource decision.
 */
export class DocumentsService {
  private readonly authorization: DocumentsAuthorization;

  constructor(
    private readonly database: DatabaseManager,
    authorization: AppAuthorization,
  ) {
    this.authorization = authorization as DocumentsAuthorization;
  }

  private get connection(): DatabaseConnection {
    return this.database.connection();
  }

  private repository() {
    return this.connection.repository<DocumentRow>(DOCUMENTS_COLLECTION);
  }

  private async decision(
    context: AuthorizationContext,
    action: DocumentsAction,
  ): Promise<AuthorizationDecision> {
    return context.authorize({
      resource: { type: 'composite', id: DOCUMENTS_RESOURCE },
      action,
    });
  }

  private async policyFor(
    context: AuthorizationContext,
    action: DocumentsAction,
  ): Promise<RepositoryPolicy> {
    const decision = await this.decision(context, action);
    const conditions = decision.conditions?.database as
      Readonly<Record<string, RepositoryPolicy>> | undefined;
    const policy =
      decision.effect === 'deny'
        ? undefined
        : conditions?.[DOCUMENTS_COLLECTION];
    if (!policy) {
      throw accessDenied();
    }
    return policy;
  }

  private async policyOptionally(
    context: AuthorizationContext,
    action: DocumentsAction,
  ): Promise<RepositoryPolicy | undefined> {
    const decision = await this.decision(context, action);
    if (decision.effect === 'deny') {
      return undefined;
    }
    const conditions = decision.conditions?.database as
      Readonly<Record<string, RepositoryPolicy>> | undefined;
    return conditions?.[DOCUMENTS_COLLECTION];
  }

  private async ownerNames(
    ownerIds: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ownerIds)];
    if (unique.length === 0) {
      return new Map();
    }
    const rows = (await this.connection.query
      .selectFrom('user')
      .select(['id', 'name'])
      .where('id', 'in', unique)
      .execute()) as readonly { id: string; name: string }[];
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private async editableIds(
    context: AuthorizationContext,
  ): Promise<Set<string>> {
    const policy = await this.policyOptionally(context, 'edit');
    if (!policy) {
      return new Set();
    }
    const rows = (await this.repository()
      .withPolicy(policy)
      .findMany()) as readonly DocumentRow[];
    return new Set(rows.map((row) => row.id));
  }

  private toPublic(
    row: DocumentRow,
    names: ReadonlyMap<string, string>,
    editable: ReadonlySet<string>,
  ): PublicDocument {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      ownerId: row.ownerId,
      ownerName: names.get(row.ownerId) ?? '',
      published: row.published,
      confidential: row.confidential,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
      canEdit: editable.has(row.id),
    };
  }

  private async mapPublic(
    context: AuthorizationContext,
    rows: readonly DocumentRow[],
  ): Promise<PublicDocument[]> {
    const [names, editable] = await Promise.all([
      this.ownerNames(rows.map((row) => row.ownerId)),
      this.editableIds(context),
    ]);
    return rows.map((row) => this.toPublic(row, names, editable));
  }

  async list(
    context: AuthorizationContext,
  ): Promise<{ items: readonly PublicDocument[]; canCreate: boolean }> {
    const [policy, createDecision] = await Promise.all([
      this.policyFor(context, 'view'),
      this.decision(context, 'create'),
    ]);
    const rows = (await this.repository()
      .withPolicy(policy)
      .findMany({
        sort: (sort) => [
          sort.field('createdAt').desc(),
          sort.field('id').desc(),
        ],
      })) as readonly DocumentRow[];
    return {
      items: await this.mapPublic(context, rows),
      canCreate: createDecision.effect !== 'deny',
    };
  }

  async get(
    context: AuthorizationContext,
    documentId: string,
  ): Promise<PublicDocument> {
    const policy = await this.policyFor(context, 'view');
    const row = (await this.repository()
      .withPolicy(policy)
      .findOne({ filter: { id: documentId } })) as DocumentRow | undefined;
    if (!row) {
      throw documentNotFound();
    }
    const [names, editable] = await Promise.all([
      this.ownerNames([row.ownerId]),
      this.editableIds(context),
    ]);
    return this.toPublic(row, names, editable);
  }

  async create(
    context: AuthorizationContext,
    ownerId: string,
    input: CreateDocumentInput,
  ): Promise<PublicDocument> {
    const policy = await this.policyFor(context, 'create');
    const now = new Date();
    const result = await this.repository()
      .withPolicy(policy)
      .createOne({
        values: {
          id: randomUUID(),
          title: input.title,
          content: input.content,
          ownerId,
          published: input.published,
          confidential: input.confidential,
          createdAt: now,
          updatedAt: now,
        },
      });
    return this.get(context, (result.record as DocumentRow).id);
  }

  async update(
    context: AuthorizationContext,
    documentId: string,
    input: UpdateDocumentInput,
  ): Promise<PublicDocument> {
    const policy = await this.policyFor(context, 'edit');
    try {
      await this.repository()
        .withPolicy(policy)
        .updateOne({
          filter: { id: documentId },
          values: {
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.content === undefined ? {} : { content: input.content }),
            ...(input.published === undefined
              ? {}
              : { published: input.published }),
            ...(input.confidential === undefined
              ? {}
              : { confidential: input.confidential }),
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      if (
        error instanceof RepositoryError &&
        error.code === 'RECORD_NOT_FOUND'
      ) {
        throw documentNotFound();
      }
      throw error;
    }
    return this.get(context, documentId);
  }

  private async allShares(): Promise<readonly SharingRule[]> {
    const rules = await this.authorization.sharingRules.list();
    return rules.filter(
      (rule) =>
        rule.resource.type === 'composite' &&
        rule.resource.id === DOCUMENTS_RESOURCE,
    );
  }

  private async userDetails(
    ids: readonly string[],
  ): Promise<
    Map<
      string,
      { id: string; name: string; username: string | null; email: string }
    >
  > {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return new Map();
    }
    const rows: {
      id: string;
      name: string;
      username: string | null;
      email: string;
    }[] = await this.connection.query
      .selectFrom('user')
      .select(['id', 'name', 'username', 'email'])
      .where('id', 'in', unique)
      .execute();
    return new Map(rows.map((row) => [row.id, row]));
  }

  async adminDocuments(): Promise<readonly AdminDocument[]> {
    const [found, rules] = await Promise.all([
      this.repository().findMany({
        sort: (sort) => [
          sort.field('createdAt').desc(),
          sort.field('id').desc(),
        ],
      }),
      this.allShares(),
    ]);
    const rows = found as unknown as readonly DocumentRow[];
    const subjectIds = rules.flatMap((rule) =>
      rule.subjects
        .filter((subject) => subject.type === 'user')
        .map((subject) => subject.id),
    );
    const [owners, users] = await Promise.all([
      this.ownerNames(rows.map((row) => row.ownerId)),
      this.userDetails(subjectIds),
    ]);
    const byDocument = new Map<string, DocumentShare[]>();
    for (const rule of rules) {
      const documentIds = rule.actions.flatMap((action) =>
        action.selection.type === 'records' ? action.selection.ids : [],
      );
      for (const documentId of documentIds) {
        const shares = byDocument.get(documentId) ?? [];
        for (const subject of rule.subjects) {
          if (subject.type !== 'user') {
            continue;
          }
          const user = users.get(subject.id);
          if (!user) {
            continue;
          }
          shares.push({
            userId: user.id,
            name: user.name,
            username: user.username,
          });
        }
        byDocument.set(documentId, shares);
      }
    }
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      ownerId: row.ownerId,
      ownerName: owners.get(row.ownerId) ?? '',
      published: row.published,
      confidential: row.confidential,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
      shares: byDocument.get(row.id) ?? [],
    }));
  }

  async recipients(): Promise<readonly SharingRecipient[]> {
    const rows = (await this.connection.query
      .selectFrom('user')
      .select(['id', 'name', 'username', 'email'])
      .where('kind', '=', 'person')
      .where('disabledAt', 'is', null)
      .orderBy('name', 'asc')
      .execute()) as readonly {
      id: string;
      name: string;
      username: string | null;
      email: string;
    }[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      email: row.email,
    }));
  }

  private async assertDocument(documentId: string): Promise<DocumentRow> {
    const row: DocumentRow | undefined = await this.repository().findOne({
      filter: { id: documentId },
    });
    if (!row) {
      throw documentNotFound();
    }
    return row;
  }

  private async assertRecipient(userId: string): Promise<void> {
    const row = await this.connection.query
      .selectFrom('user')
      .select(['id', 'kind', 'disabledAt'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!row || row.kind !== 'person') {
      throw apiError(
        'NOT_FOUND',
        'RECIPIENT_NOT_FOUND',
        'The selected recipient is not an application user.',
      );
    }
    if (row.disabledAt) {
      throw apiError(
        'FAILED_PRECONDITION',
        'RECIPIENT_DISABLED',
        'A disabled account cannot receive temporary document access.',
      );
    }
  }

  async share(documentId: string, userId: string): Promise<DocumentShare> {
    const document = await this.assertDocument(documentId);
    if (document.confidential) {
      throw apiError(
        'FAILED_PRECONDITION',
        'CONFIDENTIAL_DOCUMENT',
        'A confidential document cannot be shared temporarily.',
      );
    }
    await this.assertRecipient(userId);

    const key = shareKey(documentId, userId);
    const existing = await this.authorization.sharingRules.get(key);
    if (!existing) {
      const rule = defineSharingRule(key, documents.reference())
        .scope('view', DOCUMENTS_SCOPE, selection.records([documentId]))
        .title(label('documents.sharing.ruleTitle'))
        .subjects({ type: 'user', id: userId })
        .reason('Temporary reading access granted by an administrator.')
        .build();
      await this.authorization.sharingRules.create(rule);
    }

    const [user] = await this.userDetails([userId]).then((map) => [
      ...map.values(),
    ]);
    if (!user) {
      throw apiError(
        'NOT_FOUND',
        'RECIPIENT_NOT_FOUND',
        'The selected recipient is not an application user.',
      );
    }
    return {
      userId: user.id,
      name: user.name,
      username: user.username,
    };
  }

  async unshare(documentId: string, userId: string): Promise<void> {
    await this.assertDocument(documentId);
    const key = shareKey(documentId, userId);
    const existing = await this.authorization.sharingRules.get(key);
    if (existing) {
      await this.authorization.sharingRules.delete(key);
    }
  }
}
