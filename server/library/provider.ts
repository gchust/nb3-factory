import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  ServiceProvider,
  type ServiceResolver,
} from '@nocobase/service-provider';

import {
  LIBRARY_COLLECTION,
  libraryDocuments,
  notConfidentialRecordAccess,
  publishedRecordAccess,
} from './authorization.js';
import { DocumentLibrary } from './service.js';
import { documentLibraryToken } from './tokens.js';

/**
 * Wires the document library into the application: the portable permission
 * model and the domain service. Nothing here creates schema — the migration
 * does that — and nothing here grants access — the seeds create the editable
 * Permission Sets, the two accounts and the three documents. Boot declares the
 * model before the authorization provider's `start()` validates and serves it.
 */
export default class LibraryProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/library';

  public override register(): void {
    this.app.container.singleton(documentLibraryToken, (resolver) =>
      createDocumentLibrary(resolver),
    );
  }

  public override async boot(): Promise<void> {
    // The permission model belongs to the authorization plugin. A runtime
    // without it — a test scope or a stripped-down host — has no permission
    // system to declare it to, so skip rather than fail startup.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }

    const authz: AppAuthorization =
      this.app.container.resolve(authorizationToken);

    // Registration is the opt-in: an unregistered Collection is denied even to
    // an unrestricted identity, and the composite's data scopes need it.
    authz.database.collections.add({
      name: LIBRARY_COLLECTION,
      title: 'Documents',
      actions: ['read', 'create', 'update'],
    });
    authz.recordAccess.define(publishedRecordAccess);
    authz.recordAccess.define(notConfidentialRecordAccess);
    const reference = authz.compositeResources.define(libraryDocuments);

    // Put the resource in its own subsection of the business workspace so an
    // administrator can find and configure it.
    authz.ui.sections.add({
      name: 'library',
      parent: 'business',
      title: 'Document library',
      order: 100,
    });
    authz.ui.place(reference, { section: 'library' });
  }
}

function createDocumentLibrary(resolver: ServiceResolver): DocumentLibrary {
  const database: DatabaseManager = resolver.resolve(databaseManagerToken);
  const authorization: AppAuthorization = resolver.resolve(authorizationToken);
  const users = resolver.resolve(userAdministrationServiceToken);
  return new DocumentLibrary({ database, authorization, users });
}
