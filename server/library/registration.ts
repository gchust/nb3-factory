import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import {
  DOCUMENTS_COLLECTION,
  LIBRARY_NAMESPACE,
  registerLibraryRecordAccess,
} from './scope.js';

/**
 * Declares the library to the authorization subsystem: the collection the
 * permission workspace must offer as a resource, the three data scopes its
 * grants choose from, and where the collection is listed.
 *
 * Runs in the provider's `boot()` so it is complete before the authorization
 * provider's `start()` validates registrations. The permission sets and the
 * restriction rule are persisted configuration and are seeded, not declared
 * here, so an administrator can edit them from the backend afterwards.
 */
export function registerLibraryAuthorization(authz: AppAuthorization): void {
  authz.database.collections.add({
    name: DOCUMENTS_COLLECTION,
    title: { key: 'library.collection.title', ns: LIBRARY_NAMESPACE },
  });

  registerLibraryRecordAccess(authz);

  authz.ui.place(
    { type: 'database.collection', id: DOCUMENTS_COLLECTION },
    { section: authz.ui.sections.other('business'), order: 0 },
  );
}
