import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
  type AuthorizationContext,
} from '@nocobase/app-plugin-authorization/server';
import { defineRecordAccess } from '@nocobase/authorization/core';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  LIBRARY_READABLE_ACCESS_KEY,
  LIBRARY_SHARE_SETTINGS_ID,
  LIBRARY_VISIBLE_ACCESS_KEY,
  libraryDocuments,
} from '../library/resources.js';
import { LibraryService } from '../library/service.js';

export type LibraryServiceFactory = (
  authorization: AuthorizationContext,
) => LibraryService;

export const libraryServiceToken: ServiceToken<LibraryServiceFactory> =
  createServiceToken<LibraryServiceFactory>('app/library-service');

function registerReadableAccess(
  authz: AppAuthorization,
  database: DatabaseManager,
): void {
  authz.recordAccess.define(
    defineRecordAccess(LIBRARY_VISIBLE_ACCESS_KEY, (access) =>
      access
        .title({ key: 'library.permissions.visible', ns: 'nb3-factory' })
        .description({
          key: 'library.permissions.visibleDescription',
          ns: 'nb3-factory',
        })
        .collections('documents')
        .resolver(async ({ principal }) => {
          if (principal.type !== 'user') return false;
          return buildFilter((f) =>
            f.or([
              f.string('ownerId').eq(principal.id),
              f.and([
                f.boolean('published').isTrue(),
                f.boolean('confidential').isFalse(),
              ]),
            ]),
          );
        }),
    ),
  );
  authz.recordAccess.define(
    defineRecordAccess(LIBRARY_READABLE_ACCESS_KEY, (access) =>
      access
        .title({ key: 'library.permissions.readable', ns: 'nb3-factory' })
        .description({
          key: 'library.permissions.readableDescription',
          ns: 'nb3-factory',
        })
        .collections('documents')
        .resolver(async ({ principal }) => {
          if (principal.type !== 'user') return false;
          const shares = await database
            .query()
            .selectFrom('documentShares')
            .select('documentId')
            .where('userId', '=', principal.id)
            .execute();
          const sharedIds = shares.map((share) => String(share.documentId));
          return buildFilter((f) => {
            const published = f.and([
              f.boolean('published').isTrue(),
              f.boolean('confidential').isFalse(),
            ]);
            if (sharedIds.length === 0) return f.or([published]);
            const shared = f.and([
              f.boolean('confidential').isFalse(),
              f.or(sharedIds.map((id) => f.string('id').eq(id))),
            ]);
            return f.or([published, shared]);
          });
        }),
    ),
  );
}

function registerAuthorization(authz: AppAuthorization): void {
  authz.database.collections.add({
    name: 'documents',
    title: { key: 'library.permissions.documents', ns: 'nb3-factory' },
  });
  const reference = authz.compositeResources.define(libraryDocuments);
  authz.ui.sections.add({
    name: 'library',
    title: { key: 'library.navigation', ns: 'nb3-factory' },
    parent: 'business',
  });
  authz.ui.place(reference, { section: 'library' });

  authz.ui.sections.add({
    name: 'library.admin',
    title: { key: 'library.navigation', ns: 'nb3-factory' },
    parent: 'administration',
  });
  authz.settings.add({
    id: LIBRARY_SHARE_SETTINGS_ID,
    title: { key: 'library.admin.title', ns: 'nb3-factory' },
    actions: [
      { name: 'read', title: { key: 'library.admin.read', ns: 'nb3-factory' } },
      {
        name: 'update',
        title: { key: 'library.admin.update', ns: 'nb3-factory' },
      },
    ],
  });
  authz.ui.place(
    { type: 'settings', id: LIBRARY_SHARE_SETTINGS_ID },
    { section: 'library.admin' },
  );
}

export default class LibraryProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/library-provider';

  public override register(): void {
    this.app.container.singleton(libraryServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return (authorization) => new LibraryService(database, authorization);
    });
  }

  public override async boot(): Promise<void> {
    // Provider registration is owned by the application, while the authorization
    // service comes from an installable plugin. A runtime composed without that
    // plugin (as app-server tests do) must still boot the application-owned
    // providers, so declare the library's permission resources only when the
    // authorization service is available.
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    const database = this.app.container.resolve(databaseManagerToken);
    registerReadableAccess(authz, database);
    registerAuthorization(authz);
  }
}
