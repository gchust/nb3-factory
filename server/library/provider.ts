import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { provisionDocumentLibrary } from './provision.js';
import {
  documentsCollectionDefinition,
  documentRecordAccessList,
  libraryDocuments,
  librarySection,
} from './resources.js';
import { ensureConfidentialDocumentsRule } from './rules.js';
import { LibraryService, libraryServiceToken } from './service.js';

/**
 * Registers and provisions the document library.
 *
 * Authorization registrations are declarative: `boot()` runs after every
 * plugin provider has registered its own types, which is what makes the
 * `database.collection` opt-in and the `business` workspace section available
 * here, and before any request is served.
 *
 * Provisioning is deliberately one-time. The demonstration accounts, their
 * permission-set assignments and the sample documents are written once and
 * marked complete; a later boot never re-adds an assignment or a document an
 * administrator removed.
 */
export class LibraryProvider extends ServiceProvider<Application> {
  readonly name = 'library';

  register(): void {
    this.app.container.singleton(libraryServiceToken, (resolver) => {
      return new LibraryService(resolver.resolve(databaseManagerToken));
    });
  }

  async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authz = this.app.container.resolve(authorizationToken);

    authz.database.collections.add(documentsCollectionDefinition);
    for (const access of documentRecordAccessList) {
      authz.recordAccess.define(access);
    }

    const documents = authz.compositeResources.define(libraryDocuments);
    authz.ui.sections.add(librarySection);
    authz.ui.place(documents, { section: librarySection.name });

    // The confidentiality invariant is a standing rule, not provisioning: it
    // is created only when absent. An administrator's edit to its substance is
    // preserved, but deleting it does not weaken the invariant — it is put
    // back on the next boot, because "confidential is never opened to a
    // non-owner, even by sharing" is a requirement of the feature rather than
    // of one installation's configuration.
    await ensureConfidentialDocumentsRule(authz);

    await provisionDocumentLibrary(this.app);
  }
}
