import type { Application } from '@nocobase/app-server/application';
import type {
  DatabaseConnection,
  DatabaseManager,
  RepositoryRecord,
} from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import {
  userAdministrationServiceToken,
  type AdministratedUser,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication/server';
import { selection } from '@nocobase/authorization/core';
import {
  definePermissionSet,
  type PermissionSet,
} from '@nocobase/authorization/permission-sets';
import {
  defineRestrictionRule,
  type RestrictionRulesAuthorizationApi,
} from '@nocobase/authorization/restriction-rules';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  LIBRARY_COLLECTION,
  LIBRARY_MAINTAINER_SET,
  LIBRARY_PAGE_ID,
  LIBRARY_READER_SET,
  LIBRARY_RESOURCE_ID,
  LIBRARY_RESTRICTION_KEY,
  LIBRARY_SCOPE,
  libraryDocuments,
  libraryMaintainerGrant,
  libraryReaderGrant,
  notConfidentialRecordAccess,
  NOT_CONFIDENTIAL_RECORD_ACCESS,
  publishedRecordAccess,
} from '../library/authorization.js';
import {
  LIBRARY_DOCUMENTS,
  MAINTAINER_ACCOUNT,
  READER_ACCOUNT,
  type LibraryAccountSeed,
} from '../library/seed-data.js';

type LibraryAuthorization = AppAuthorization &
  RestrictionRulesAuthorizationApi<DatabaseConnection>;

/**
 * Declares the document library's permission model and provisions the accounts
 * and documents it needs.
 *
 * Declaration happens in `boot()` because the authorization provider validates
 * the workspace in `start()`, after every provider has booted. Provisioning
 * happens in `start()` because it needs the users and authorization services,
 * which are started by then. Both are idempotent: a restart, an upgrade or a
 * re-run never duplicates a row and never overwrites an edited one.
 */
export default class LibraryProvider extends ServiceProvider<Application> {
  override readonly name = 'library';

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(authorizationToken)) {
      return;
    }
    const authz = container.resolve(authorizationToken) as LibraryAuthorization;

    // Registration is the opt-in: an unregistered Collection is denied even to
    // an unrestricted identity, and the composite's data scopes need it.
    authz.database.collections.add({
      name: LIBRARY_COLLECTION,
      title: 'Documents',
      actions: ['read', 'create', 'update'],
    });
    authz.recordAccess.define(publishedRecordAccess);
    authz.recordAccess.define(notConfidentialRecordAccess);
    authz.compositeResources.define(libraryDocuments);

    // Put the resource in its own subsection of the business workspace so an
    // administrator can find and configure it.
    authz.ui.sections.add({
      name: 'library',
      title: 'Document library',
      parent: 'business',
      order: 100,
    });
    authz.ui.place(
      { type: 'composite', id: LIBRARY_RESOURCE_ID },
      { section: 'library' },
    );
  }

  override async start(): Promise<void> {
    const { container } = this.app;
    if (
      !container.has(databaseManagerToken) ||
      !container.has(authorizationToken)
    ) {
      return;
    }
    if (!container.has(userAdministrationServiceToken)) {
      return;
    }

    const database: DatabaseManager = container.resolve(databaseManagerToken);
    const connection = database.connection();

    // A process that starts before its migrations were applied has no
    // documents table yet; provisioning resumes on the next start.
    if (!(await connection.collections.get(LIBRARY_COLLECTION))) {
      return;
    }

    try {
      const authz = container.resolve(
        authorizationToken,
      ) as LibraryAuthorization;
      const users: UserAdministrationService = container.resolve(
        userAdministrationServiceToken,
      );

      const maintainer = await this.ensureAccount(users, MAINTAINER_ACCOUNT);
      const reader = await this.ensureAccount(users, READER_ACCOUNT);

      await this.ensurePermissionSet(
        authz,
        libraryMaintainerSet(authz),
        maintainer.id,
      );
      await this.ensurePermissionSet(authz, libraryReaderSet(authz), reader.id);
      await this.ensureDocuments(connection, maintainer.id);
      await this.ensureRestriction(authz, reader.id);
    } catch (error) {
      // Never break startup over provisioning: an administrator can repair the
      // data, and the next start retries.
      this.warn(
        `Could not provision the document library: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async findAccount(
    users: UserAdministrationService,
    seed: LibraryAccountSeed,
  ): Promise<AdministratedUser | undefined> {
    const byUsername = await users.list({
      search: seed.username,
      pageSize: 50,
    });
    const match = byUsername.items.find(
      (user) => user.username === seed.username,
    );
    if (match) {
      return match;
    }
    const byEmail = await users.list({ search: seed.email, pageSize: 50 });
    return byEmail.items.find((user) => user.email === seed.email);
  }

  private async ensureAccount(
    users: UserAdministrationService,
    seed: LibraryAccountSeed,
  ): Promise<AdministratedUser> {
    const existing = await this.findAccount(users, seed);
    if (existing) {
      return existing;
    }
    return users.create({
      name: seed.name,
      username: seed.username,
      email: seed.email,
      password: seed.password,
    });
  }

  private async ensurePermissionSet(
    authz: LibraryAuthorization,
    set: PermissionSet,
    userId: string,
  ): Promise<void> {
    const existing = await authz.permissionSets.get(set.key);
    if (!existing) {
      await authz.permissionSets.create({
        key: set.key,
        title: set.title,
        grants: set.grants,
      });
    }
    const assignments = await authz.permissionSets.listAssignments();
    const assigned = assignments.some(
      (assignment) =>
        assignment.permissionSet === set.key &&
        assignment.subject.type === 'user' &&
        assignment.subject.id === userId,
    );
    if (!assigned) {
      await authz.permissionSets.assign({
        subject: { type: 'user', id: userId },
        permissionSet: set.key,
      });
    }
  }

  private async ensureDocuments(
    connection: DatabaseConnection,
    ownerId: string,
  ): Promise<void> {
    const repository = connection.repository<RepositoryRecord>('documents');
    for (const document of LIBRARY_DOCUMENTS) {
      // The fixed id makes provisioning idempotent; the title is the stable
      // business key a human edits around.
      const existing = await repository.findOne({
        filter: { id: document.id },
      });
      if (existing) {
        continue;
      }
      await repository.createOne({
        values: {
          id: document.id,
          title: document.title,
          body: document.body,
          ownerId,
          published: document.published,
          confidential: document.confidential,
        },
      });
    }
  }

  private async ensureRestriction(
    authz: LibraryAuthorization,
    readerId: string,
  ): Promise<void> {
    const rules = authz.restrictionRules;
    if (!rules) {
      return;
    }
    const existing = await rules.get(LIBRARY_RESTRICTION_KEY);
    if (existing) {
      return;
    }
    await rules.create(
      defineRestrictionRule(
        LIBRARY_RESTRICTION_KEY,
        libraryDocuments.reference(),
      )
        .title('Readers never see confidential documents')
        .subjects({ type: 'user', id: readerId })
        .scope(
          'view',
          LIBRARY_SCOPE,
          selection.recordAccess(NOT_CONFIDENTIAL_RECORD_ACCESS),
        )
        .scope(
          'edit',
          LIBRARY_SCOPE,
          selection.recordAccess(NOT_CONFIDENTIAL_RECORD_ACCESS),
        )
        .reason(
          'A confidential document stays hidden from a reader even if it is shared by mistake.',
        )
        .build(),
    );
  }

  private warn(message: string): void {
    console.warn(`[library] ${message}`);
  }
}

function libraryMaintainerSet(authz: LibraryAuthorization): PermissionSet {
  return definePermissionSet(LIBRARY_MAINTAINER_SET)
    .title('Document maintainer')
    .grant(authz.pages.grant(LIBRARY_PAGE_ID))
    .grant(libraryMaintainerGrant())
    .build();
}

function libraryReaderSet(authz: LibraryAuthorization): PermissionSet {
  return definePermissionSet(LIBRARY_READER_SET)
    .title('Document reader')
    .grant(authz.pages.grant(LIBRARY_PAGE_ID))
    .grant(libraryReaderGrant())
    .build();
}
