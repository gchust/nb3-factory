import { randomUUID } from 'node:crypto';

import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import type { DatabaseManager } from '@nocobase/db';
import { APP_NS } from '@nocobase/i18n';
import { databaseManagerToken } from '@nocobase/db';
import type { RepositoryPolicy } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';
import {
  defineRestrictionRule,
  type RestrictionRulesAuthorizationApi,
} from '@nocobase/authorization/restriction-rules';
import { selection } from '@nocobase/authorization/core';

import {
  DOCUMENT_ADMIN_PERMISSION_SET,
  DOCUMENT_MAINTAINER_PERMISSION_SET,
  DOCUMENT_READER_PERMISSION_SET,
  DOCUMENT_READER_RESTRICTION_PREFIX,
  documentPermissionSetDefinitions,
  documentResource,
  nonConfidentialAccess,
  ownOrPublishedAccess,
  publishedPublicAccess,
  type DocumentRecord,
} from '../authorization/documents.js';

export interface DocumentView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly ownerId: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateDocumentInput {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

export interface UpdateDocumentInput {
  readonly title?: string;
  readonly body?: string;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

export interface DocumentService {
  list(policy: RepositoryPolicy<DocumentRecord>): Promise<DocumentView[]>;
  get(
    id: string,
    policy: RepositoryPolicy<DocumentRecord>,
  ): Promise<DocumentView | undefined>;
  create(
    input: CreateDocumentInput,
    ownerId: string,
    policy: RepositoryPolicy<DocumentRecord>,
  ): Promise<DocumentView>;
  update(
    id: string,
    input: UpdateDocumentInput,
    policy: RepositoryPolicy<DocumentRecord>,
  ): Promise<DocumentView | undefined>;
  remove(
    id: string,
    policy: RepositoryPolicy<DocumentRecord>,
  ): Promise<boolean>;
}

export interface DocumentRoleAssignment {
  readonly id: string;
  readonly name: string;
  readonly username?: string;
  readonly email: string;
  readonly roles: readonly string[];
  readonly disabledAt: string | null;
}

export interface DocumentUserList {
  readonly users: readonly DocumentRoleAssignment[];
  readonly total: number;
}

export interface DocumentAdministrationService {
  listUsers(input: {
    q?: string;
    page: number;
    pageSize: number;
  }): Promise<DocumentUserList>;
  setUserRoles(userId: string, roles: readonly string[]): Promise<void>;
}

export const documentServiceToken: ServiceToken<DocumentService> =
  createServiceToken<DocumentService>('app/document-service');

export const documentAdministrationServiceToken: ServiceToken<DocumentAdministrationService> =
  createServiceToken<DocumentAdministrationService>(
    'app/document-administration-service',
  );

const DOCUMENT_ROLE_KEYS = new Set([
  DOCUMENT_ADMIN_PERMISSION_SET,
  DOCUMENT_MAINTAINER_PERMISSION_SET,
  DOCUMENT_READER_PERMISSION_SET,
]);

const toView = (record: DocumentRecord): DocumentView => ({
  id: String(record.id),
  title: record.title,
  body: record.body,
  ownerId: record.ownerId,
  published: record.published,
  confidential: record.confidential,
  createdAt: new Date(record.createdAt).toISOString(),
  updatedAt: new Date(record.updatedAt).toISOString(),
});

function createDocumentService(database: DatabaseManager): DocumentService {
  return {
    async list(policy) {
      const records = await database
        .repository<DocumentRecord>('documents')
        .withPolicy(policy)
        .findMany({
          sort: (sort) => [
            sort.field('updatedAt').desc(),
            sort.field('id').desc(),
          ],
        });
      return (records as DocumentRecord[]).map(toView);
    },

    async get(id, policy) {
      const record = await database
        .repository<DocumentRecord>('documents')
        .withPolicy(policy)
        .findOne({ filter: { id } });
      return record ? toView(record as DocumentRecord) : undefined;
    },

    async create(input, ownerId, policy) {
      const now = new Date();
      const result = await database
        .repository<DocumentRecord>('documents')
        .withPolicy(policy)
        .createOne({
          values: {
            ...input,
            id: randomUUID(),
            ownerId,
            createdAt: now,
            updatedAt: now,
          },
        });
      return toView(result.record as DocumentRecord);
    },

    async update(id, input, policy) {
      const repository = database
        .repository<DocumentRecord>('documents')
        .withPolicy(policy);
      const current = await repository.findOne({ filter: { id } });
      if (!current) return undefined;
      const result = await repository.updateOne({
        filter: { id },
        values: { ...input, updatedAt: new Date() },
      });
      return toView(result.record as DocumentRecord);
    },

    async remove(id, policy) {
      const repository = database
        .repository<DocumentRecord>('documents')
        .withPolicy(policy);
      const current = await repository.findOne({ filter: { id } });
      if (!current) return false;
      await repository.deleteOne({ filter: { id } });
      return true;
    },
  };
}

/**
 * The reader restriction narrows a reader who has no broader document role. Document roles combine by union, so a
 * person who is also an administrator or maintainer keeps the confidential records those roles manage.
 */
export function shouldRestrictToNonConfidential(
  roles: readonly string[],
): boolean {
  return (
    roles.includes(DOCUMENT_READER_PERMISSION_SET) &&
    !roles.includes(DOCUMENT_ADMIN_PERMISSION_SET) &&
    !roles.includes(DOCUMENT_MAINTAINER_PERMISSION_SET)
  );
}

function restrictionRules(
  authz: AppAuthorization,
): RestrictionRulesAuthorizationApi {
  if (!('restrictionRules' in authz)) {
    throw new Error('Restriction rules are not configured');
  }
  return authz as AppAuthorization & RestrictionRulesAuthorizationApi;
}

function createDocumentAdministrationService(
  database: DatabaseManager,
  authz: AppAuthorization,
): DocumentAdministrationService {
  return {
    async listUsers({ q, page, pageSize }) {
      const offset = (page - 1) * pageSize;
      let base = database.connection().query.selectFrom('user');
      let countQuery = database
        .connection()
        .query.selectFrom('user')
        .select((builder) => [builder.fn.countAll<number>().as('total')]);

      if (q) {
        const pattern = `%${q}%`;
        base = base.where((builder) =>
          builder.or([
            builder('name', 'like', pattern),
            builder('username', 'like', pattern),
            builder('email', 'like', pattern),
          ]),
        );
        countQuery = countQuery.where((builder) =>
          builder.or([
            builder('name', 'like', pattern),
            builder('username', 'like', pattern),
            builder('email', 'like', pattern),
          ]),
        );
      }

      const [rows, countRow, assignments] = await Promise.all([
        base
          .select(['id', 'name', 'username', 'email', 'disabledAt'])
          .orderBy('name', 'asc')
          .offset(offset)
          .limit(pageSize)
          .execute(),
        countQuery.executeTakeFirst(),
        database
          .connection()
          .query.selectFrom('authorizationPermissionSetAssignments')
          .select(['subjectId', 'permissionSetKey'])
          .where('subjectType', '=', 'user')
          .where('permissionSetKey', 'in', [...DOCUMENT_ROLE_KEYS])
          .execute(),
      ]);

      const roles = new Map<string, string[]>();
      for (const assignment of assignments) {
        const userId = String(assignment.subjectId);
        const current = roles.get(userId) ?? [];
        current.push(String(assignment.permissionSetKey));
        roles.set(userId, current);
      }

      return {
        users: rows.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          username: typeof row.username === 'string' ? row.username : undefined,
          email: String(row.email),
          roles: roles.get(String(row.id)) ?? [],
          disabledAt: row.disabledAt
            ? new Date(row.disabledAt as Date | string).toISOString()
            : null,
        })),
        total: Number(countRow?.total ?? 0),
      };
    },

    async setUserRoles(userId, requestedRoles) {
      const roles = [...new Set(requestedRoles)];
      if (roles.some((role) => !DOCUMENT_ROLE_KEYS.has(role))) {
        throw new Error('Unknown document role');
      }

      const user = await database
        .connection()
        .query.selectFrom('user')
        .select('id')
        .where('id', '=', userId)
        .executeTakeFirst();
      if (!user) throw new Error('User not found');

      const subject = { type: 'user', id: userId };
      await database.transaction(async (connection) => {
        const sets = authz.permissionSets.withTransaction(connection);
        const existing = (await sets.listAssignments()).filter(
          (assignment) =>
            assignment.subject.type === 'user' &&
            assignment.subject.id === userId &&
            DOCUMENT_ROLE_KEYS.has(assignment.permissionSet),
        );
        const existingKeys = new Set(
          existing.map((assignment) => assignment.permissionSet),
        );
        for (const assignment of existing) {
          if (!roles.includes(assignment.permissionSet)) {
            await sets.revoke(assignment.id);
          }
        }
        for (const role of roles) {
          if (!existingKeys.has(role)) {
            await sets.assign({ permissionSet: role, subject });
          }
        }
        await sets.notifyAssignmentsChanged(subject);

        const rules =
          restrictionRules(authz).restrictionRules.withTransaction(connection);
        const ruleKey = `${DOCUMENT_READER_RESTRICTION_PREFIX}${userId}`;
        const shouldRestrict = shouldRestrictToNonConfidential(roles);
        const current = await rules.get(ruleKey);
        if (shouldRestrict && !current) {
          await rules.create(
            defineRestrictionRule(ruleKey, documentResource.reference())
              .title({
                key: 'documents.restriction.nonConfidential',
                ns: APP_NS,
              })
              .subjects(subject)
              .scope(
                'view',
                'documents',
                selection.recordAccess('documents.nonConfidential'),
              )
              .build(),
          );
        } else if (!shouldRestrict && current) {
          await rules.delete(ruleKey);
        }
      });
    },
  };
}

export default class DocumentsProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/documents-provider';

  public override register(): void {
    this.app.container.singleton(documentServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createDocumentService(database);
    });
    this.app.container.singleton(documentAdministrationServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const authz = this.app.container.resolve(authorizationToken);
      return createDocumentAdministrationService(database, authz);
    });
  }

  public override async boot(): Promise<void> {
    // `authorizationToken` belongs to the Authorization plugin. This application always registers that
    // plugin, but a runtime may assemble the application's providers without it (the template's
    // provider/runtime tests do), so document authorization is contributed only when it exists.
    if (!this.app.container.has(authorizationToken)) return;

    const authz = this.app.container.resolve(authorizationToken);

    authz.recordAccess.define(ownOrPublishedAccess);
    authz.recordAccess.define(publishedPublicAccess);
    authz.recordAccess.define(nonConfidentialAccess);

    authz.database.collections.add({
      name: 'documents',
      title: { key: 'documents.title', ns: APP_NS },
    });
    const reference = authz.compositeResources.define(documentResource);
    authz.ui.sections.add({
      name: 'documents',
      title: { key: 'documents.section', ns: APP_NS },
      parent: 'business',
    });
    authz.ui.place(reference, { section: 'documents' });

    authz.settings.add({
      id: 'documents.administration',
      title: { key: 'documents.administration.title', ns: APP_NS },
      actions: [{ name: 'read' }, { name: 'manage' }],
    });
    authz.ui.sections.add({
      name: 'documents.administration',
      title: { key: 'documents.administration.section', ns: APP_NS },
      parent: 'administration',
    });
    authz.ui.place(
      { type: 'settings', id: 'documents.administration' },
      { section: 'documents.administration' },
    );

    const permissionSets = authz.permissionSets;
    permissionSets.protect({
      owner: 'app',
      keys: documentPermissionSetDefinitions.map(
        (definition) => definition.key,
      ),
    });
    for (const definition of documentPermissionSetDefinitions) {
      const existing = await permissionSets.get(definition.key);
      if (existing) {
        await permissionSets.update(definition.key, definition);
      } else {
        await permissionSets.create(definition);
      }
    }
  }
}
