import type { Application } from '@nocobase/app-server/application';
import type { DatabaseConnection } from '@nocobase/db';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import type { RestrictionRulesAuthorizationApi } from '@nocobase/authorization/restriction-rules';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  LIBRARY_COLLECTION,
  LIBRARY_RESOURCE_ID,
  libraryDocuments,
  libraryTitle,
  notConfidentialRecordAccess,
  publishedRecordAccess,
} from '../library/authorization.js';

type LibraryAuthorization = AppAuthorization &
  RestrictionRulesAuthorizationApi<DatabaseConnection>;

/**
 * Declares the document library's permission model.
 *
 * Declaration happens in `boot()` because the authorization provider validates
 * the workspace in `start()`, after every provider has booted. This provider
 * declares only: the accounts, documents, permission sets, assignments and the
 * confidentiality restriction rule that make up the demonstration are seeded
 * once (`database/main/seeds/20261007*`), so a boot never rewrites an
 * administrator's edits and never provisions on production startup.
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
      title: libraryTitle('collection'),
      actions: ['read', 'create', 'update'],
    });
    authz.recordAccess.define(publishedRecordAccess);
    authz.recordAccess.define(notConfidentialRecordAccess);
    authz.compositeResources.define(libraryDocuments);

    // Put the resource in its own subsection of the business workspace so an
    // administrator can find and configure it.
    authz.ui.sections.add({
      name: 'library',
      title: libraryTitle('resource'),
      parent: 'business',
      order: 100,
    });
    authz.ui.place(
      { type: 'composite', id: LIBRARY_RESOURCE_ID },
      { section: 'library' },
    );
  }
}
