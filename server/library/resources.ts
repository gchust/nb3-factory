import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import { defineCompositeResource } from '@nocobase/authorization/core';

export const LIBRARY_RESOURCE_ID = 'library.documents';
export const LIBRARY_PAGE_ID = 'library.documents';
export const LIBRARY_SHARE_SETTINGS_ID = 'library.shares';
export const LIBRARY_READABLE_ACCESS_KEY = 'library.readable';
export const LIBRARY_VISIBLE_ACCESS_KEY = 'library.visible';

/** The record access reference a permission set stores for a shared draft. */
export const libraryReadableRecordAccess = {
  key: LIBRARY_READABLE_ACCESS_KEY,
  collections: ['documents'],
} as const;

/** The record access reference a maintainer stores for their own drafts and public documents. */
export const libraryVisibleRecordAccess = {
  key: LIBRARY_VISIBLE_ACCESS_KEY,
  collections: ['documents'],
} as const;

export interface LibraryDocumentRecord {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

const readFields = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const;

const createFields = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const;

const updateFields = [
  'title',
  'body',
  'published',
  'confidential',
  'updatedAt',
] as const;

/** Reading: a maintainer's own drafts or a public document, and a reader's public or shared documents. */
export const libraryDocumentsRead = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocumentRecord>('documents')
    .title({ key: 'library.permissions.documents', ns: 'nb3-factory' })
    .read(readFields)
    .options(
      recordAccess.recordsIOwn,
      libraryVisibleRecordAccess,
      libraryReadableRecordAccess,
    )
    .default(recordAccess.recordsIOwn),
);

/**
 * Creating always produces a document owned by the signed-in person. The read
 * fields let the Repository return the row it just wrote; the create action's
 * scope, not this read node, is what limits which documents it may create.
 */
export const libraryDocumentsCreate = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocumentRecord>('documents')
    .title({ key: 'library.permissions.documents', ns: 'nb3-factory' })
    .read(readFields)
    .create(createFields)
    .options(recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn),
);

/**
 * Editing and deleting stay inside the maintainer's own documents. The read
 * fields are what the Repository needs to return the row it changed or removed.
 */
export const libraryDocumentsUpdate = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocumentRecord>('documents')
    .title({ key: 'library.permissions.documents', ns: 'nb3-factory' })
    .read(readFields)
    .update(updateFields)
    .options(recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn),
);

export const libraryDocumentsDelete = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocumentRecord>('documents')
    .title({ key: 'library.permissions.documents', ns: 'nb3-factory' })
    .read(readFields)
    .delete()
    .options(recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn),
);

/**
 * The document library's responsibilities. View is the only action a reader
 * receives; maintaining adds create, edit and delete over the same collection,
 * each restricted to documents the maintainer owns.
 */
export const libraryDocuments = defineCompositeResource(
  LIBRARY_RESOURCE_ID,
  (resource) =>
    resource
      .title({ key: 'library.permissions.resource', ns: 'nb3-factory' })
      .action('view', (action) =>
        action
          .title({ key: 'library.permissions.view', ns: 'nb3-factory' })
          .grant('documents', libraryDocumentsRead),
      )
      .action('create', (action) =>
        action
          .title({ key: 'library.permissions.create', ns: 'nb3-factory' })
          .grant('documents', libraryDocumentsCreate),
      )
      .action('edit', (action) =>
        action
          .title({ key: 'library.permissions.edit', ns: 'nb3-factory' })
          .grant('documents', libraryDocumentsUpdate),
      )
      .action('delete', (action) =>
        action
          .title({ key: 'library.permissions.delete', ns: 'nb3-factory' })
          .grant('documents', libraryDocumentsDelete),
      ),
);
