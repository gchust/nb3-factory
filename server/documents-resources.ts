import {
  defineDatabasePermission,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import { buildFilter } from '@nocobase/repository-input';

/** The id the composite is registered and checked under. */
export const DOCUMENTS_COMPOSITE = 'documents.records';

/** The row shape of `documents`, as the authorization declarations read it. */
export interface DocumentRecord {
  id: number;
  title: string;
  body: string;
  accessLevel: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** Only the supervisor scope may read and edit this value. */
export const SUPERVISOR_ACCESS_LEVEL = 'supervisor';
/** Every signed-in colleague's scope selects these rows. */
export const STAFF_ACCESS_LEVEL = 'staff';

/**
 * What a documents action may read and write. `accessLevel` is readable because the scope resolver and
 * the client branch on it; it is deliberately not writable — an editor changes wording, not who may
 * read the row.
 */
const documentData = defineDatabasePermission((permission) =>
  permission
    .collection<DocumentRecord>('documents')
    .title('Documents')
    .read(['id', 'title', 'body', 'accessLevel', 'createdAt', 'updatedAt'])
    .update(['title', 'body', 'updatedAt']),
);

/**
 * One composite behind both the documents page and the read-only assistant, so neither entry can
 * widen the other: `read` returns only rows the caller's data scope selects, `edit` additionally
 * writes title and body.
 */
export const documents = defineCompositeResource(
  DOCUMENTS_COMPOSITE,
  (resource) =>
    resource
      .title('Documents')
      .action('read', (action) =>
        action.title('Read').grant('documents', documentData),
      )
      .action('edit', (action) =>
        action.title('Edit').grant('documents', documentData),
      ),
);

export const STAFF_SCOPE = 'documents-staff-scope';
export const ALL_SCOPE = 'documents-all-scope';

/**
 * Register the collection, the two data scopes and the composite. Called from the owning provider's
 * `boot()`, never at module scope.
 */
export function registerDocumentsResources(authz: AppAuthorization): void {
  authz.database.collections.add({
    name: 'documents',
    title: 'Documents',
  });

  authz.recordAccess.define(
    defineRecordAccess(STAFF_SCOPE, (access) =>
      access
        .title('Shared documents')
        .collections('documents')
        .resolver(() =>
          buildFilter((filter) =>
            filter.string('accessLevel').eq(STAFF_ACCESS_LEVEL),
          ),
        ),
    ),
  );

  authz.recordAccess.define(
    defineRecordAccess(ALL_SCOPE, (access) =>
      access
        .title('All documents')
        .collections('documents')
        .resolver(() => true),
    ),
  );

  const reference = authz.compositeResources.define(documents);
  authz.ui.sections.add({
    name: 'documents',
    title: 'Documents',
    parent: 'business',
  });
  authz.ui.place(reference, { section: 'documents' });
}
