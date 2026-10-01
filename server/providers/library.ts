/**
 * Wires the document library into the application: its service, its catalog
 * entries, the reader-visibility record access and the two composites the
 * backend lists.
 *
 * The provider runs after the plugin providers, so `authorizationToken` is
 * already registered. Composites and record access are declared in `boot()`
 * rather than at module scope because registering them needs the live
 * authorization instance.
 */
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { defineReaderVisibleRecordAccess } from '../library-record-access.js';
import { libraryDocuments, libraryShares } from '../library-resources.js';
import { LibraryService, libraryServiceToken } from '../library-service.js';
import { APP_NAMESPACE } from '../library-types.js';

const t = (key: string) => ({ key, ns: APP_NAMESPACE });

export class LibraryProvider extends ServiceProvider<Application> {
  readonly name = 'nb3-factory.library';

  register(): void {
    this.app.container.singleton(
      libraryServiceToken,
      (container) =>
        new LibraryService(container.resolve(databaseManagerToken)),
    );
  }

  async boot(): Promise<void> {
    // The library plugs into the authorization plugin, which an application
    // composed through `server/plugins.ts` always has. A host that mounts this
    // application's providers without that plugin has no permission model to
    // register against, so there is nothing to wire and the rest of the
    // application must still start.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authz = this.app.container.resolve(authorizationToken);
    const database = this.app.container.resolve(databaseManagerToken);

    authz.database.collections.add({
      name: 'documents',
      title: t('library.collections.documents'),
    });
    authz.database.collections.add({
      name: 'documentShares',
      title: t('library.collections.documentShares'),
    });
    authz.recordAccess.define(defineReaderVisibleRecordAccess(database));

    const documents = authz.compositeResources.define(libraryDocuments);
    const shares = authz.compositeResources.define(libraryShares);

    authz.ui.sections.add({
      name: 'library',
      title: t('library.sections.library'),
      parent: 'business',
    });
    authz.ui.place(documents, { section: 'library', order: 0 });
    authz.ui.place(shares, { section: 'library', order: 1 });
  }
}
