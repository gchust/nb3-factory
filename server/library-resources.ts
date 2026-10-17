import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { buildFilter } from '@nocobase/repository-input';

import type { LibraryDocumentRow } from './library-types.js';

const title = (key: string) => ({ key, ns: 'app' });

/**
 * The catalogue every reader may reach: published, non-confidential documents plus the reader's own work, including
 * drafts and confidential documents. A sharing rule can add one non-confidential record without widening this base;
 * the service also filters confidential documents on every read so a stale rule can never expose one.
 */
export const visibleDocumentAccess = defineRecordAccess(
  'library.visible',
  (access) =>
    access
      .title(title('library.recordAccess.visible'))
      .description(title('library.recordAccess.visibleDescription'))
      .collections('libraryDocuments')
      .resolver(({ principal }) => {
        if (principal.type !== 'user') return false;
        return buildFilter((filter) =>
          filter.or([
            filter.and([
              filter.boolean('published').isTrue(),
              filter.boolean('confidential').isFalse(),
            ]),
            filter.string('ownerId').eq(principal.id),
          ]),
        );
      }),
);

const READ_FIELDS = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof LibraryDocumentRow)[];

const CREATE_FIELDS = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof LibraryDocumentRow)[];

const UPDATE_FIELDS = [
  'title',
  'body',
  'published',
  'confidential',
  'updatedAt',
] as const satisfies readonly (keyof LibraryDocumentRow)[];

const documentData = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocumentRow>('libraryDocuments')
    .title(title('library.resources.documents'))
    .options(recordAccess.recordsIOwn, visibleDocumentAccess.reference())
    .default(recordAccess.recordsIOwn)
    .read(READ_FIELDS),
);

const viewPermission = documentData;

const createPermission = documentData.create(CREATE_FIELDS);

const editPermission = documentData.update(UPDATE_FIELDS);

const deletePermission = documentData.delete();

/**
 * The business operations the library exposes. Each action expands into one collection permission bound to the
 * `documents` data scope, so permission sets choose who reaches which records without restating fields.
 */
export const libraryDocuments = defineCompositeResource(
  'library.documents',
  (resource) =>
    resource
      .title(title('library.resources.documents'))
      .action('view', (action) =>
        action.title(title('library.actions.view')).grant(
          viewPermission.bind('documents', {
            title: title('library.scopes.documents'),
          }),
        ),
      )
      .action('create', (action) =>
        action.title(title('library.actions.create')).grant(
          createPermission.bind('documents', {
            title: title('library.scopes.documents'),
          }),
        ),
      )
      .action('edit', (action) =>
        action.title(title('library.actions.edit')).grant(
          editPermission.bind('documents', {
            title: title('library.scopes.documents'),
          }),
        ),
      )
      .action('delete', (action) =>
        action.title(title('library.actions.delete')).grant(
          deletePermission.bind('documents', {
            title: title('library.scopes.documents'),
          }),
        ),
      ),
);

export const LIBRARY_RESOURCE = 'library.documents';

/**
 * Registers the model at boot. Registration grants nobody access: the initial permission sets are seeds, and an
 * administrator can change them afterwards.
 */
export function registerLibraryAuthorization(authz: AppAuthorization): void {
  authz.database.collections.add({
    name: 'libraryDocuments',
    title: title('library.resources.documents'),
    description: title('library.resources.documentsDescription'),
    actions: ['read', 'create', 'update', 'delete'],
  });
  authz.recordAccess.define(visibleDocumentAccess);
  const documents = authz.compositeResources.define(libraryDocuments);
  authz.settings.add({
    id: 'library.administration',
    title: title('library.settings.title'),
    actions: [
      { name: 'read', title: title('library.settings.read') },
      { name: 'update', title: title('library.settings.update') },
    ],
  });

  authz.ui.sections.add({
    name: 'library',
    title: title('library.sections.library'),
    order: 40,
  });
  authz.ui.sections.add({
    name: 'library.documents',
    title: title('library.sections.documents'),
    parent: 'library',
  });
  authz.ui.sections.add({
    name: 'library.administration',
    title: title('library.sections.administration'),
    parent: 'library',
  });
  authz.ui.place(documents, { section: 'library.documents' });
  authz.ui.place(
    { type: 'settings', id: 'library.administration' },
    { section: 'library.administration' },
  );
}
