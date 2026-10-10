import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

import {
  createLibraryService,
  type LibraryService,
} from '../library-service.js';
import {
  LIBRARY_DOCUMENTS_COLLECTION,
  library,
  libraryNonConfidential,
  libraryOwned,
  libraryTitle,
  libraryVisible,
} from '../library-resources.js';

/** The library service, resolved by the routes. */
export const libraryServiceToken = createServiceToken<LibraryService>(
  'nb3-factory/library-service',
);

/**
 * Registers the document library as a business capability: the collection the
 * authorization workspace knows, the record access definitions that scope it,
 * the composite resource a permission set grants, and where the workspace lists
 * it. The service is bound here too so the routes never build one themselves.
 */
export class LibraryProvider extends ServiceProvider<Application> {
  readonly name = 'nb3-factory/library';

  register(): void {
    if (!this.app.container.has(databaseManagerToken)) return;
    const database = this.app.container.resolve(databaseManagerToken);
    this.app.container.singleton(libraryServiceToken, () =>
      createLibraryService(database),
    );
  }

  async boot(): Promise<void> {
    // The library is defined in terms of the authorization workspace, so it is
    // inert in a runtime that does not register the authorization plugin (a
    // minimal test runtime, for example) instead of failing that runtime.
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);

    // The collection is intent only: fields and keys are read from the
    // database at check time, so it must exist before a check resolves it.
    authz.database.collections.add({
      name: LIBRARY_DOCUMENTS_COLLECTION,
      title: libraryTitle('library.collection.documents'),
      description: libraryTitle('library.collection.documents.description'),
    });

    authz.recordAccess.define(libraryOwned);
    authz.recordAccess.define(libraryVisible);
    authz.recordAccess.define(libraryNonConfidential);

    const reference = authz.compositeResources.define(library);

    authz.ui.sections.add({
      name: 'library',
      title: libraryTitle('library.section.documents'),
      parent: 'business',
    });
    authz.ui.place(reference, { section: 'library' });
  }
}
