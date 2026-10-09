import { ServiceProvider } from '@nocobase/service-provider';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  APP_NAMESPACE,
  LIBRARY_COLLECTION,
  libraryDocuments,
} from '../library/resources.js';
import { libraryRecordAccess } from '../library/record-access.js';

const libraryTitle = { key: 'library.resource.title', ns: APP_NAMESPACE };

/**
 * Registers the document library's business operation with Authorization:
 * the Collection it owns, the record access its data scopes offer, the
 * `library.documents` composite, and the workspace subsection the permission
 * screens list it under.
 *
 * Registration only declares intent; no record is read here. The providers'
 * `register()` phase runs after every plugin provider, so the Authorization
 * singleton this resolves already has the database and rule plugins installed.
 */
export class LibraryProvider extends ServiceProvider<Application> {
  name = 'library';

  register(): void {
    // The Authorization plugin is always registered by this application's
    // plugin composition, but a runtime built without it (a test that installs
    // no plugins) still registers application providers. Skip the declaration
    // rather than fail: there is nothing to declare against.
    if (!this.app.container.has(authorizationToken)) return;

    const authz = this.app.container.resolve(authorizationToken);

    for (const definition of libraryRecordAccess) {
      authz.recordAccess.define(definition);
    }

    // Registering the Collection is the opt-in that lets it be granted at all.
    authz.database.collections.add({
      name: LIBRARY_COLLECTION,
      title: libraryTitle,
      actions: ['read', 'create', 'update', 'delete'],
    });

    const reference = authz.compositeResources.define(libraryDocuments);

    authz.ui.sections.add({
      name: 'library',
      title: { key: 'library.workspace.section', ns: APP_NAMESPACE },
      order: 100,
    });
    authz.ui.sections.add({
      name: 'library.documents',
      title: { key: 'library.workspace.group', ns: APP_NAMESPACE },
      parent: 'library',
      order: 10,
    });
    authz.ui.place(reference, {
      section: 'library.documents',
      order: 10,
    });
  }
}

export default LibraryProvider;
