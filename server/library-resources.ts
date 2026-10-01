/**
 * The document library's authorization vocabulary: the collection-level
 * permissions each operation needs and the composites the backend lists them
 * under.
 *
 * `library.documents` is the single resource business roles hold. Its four
 * actions map to the four Collection operations, so a grant on it is exactly a
 * set of read/create/update/delete capabilities on `documents`. `library.shares`
 * is a separate, root-only resource for handing one document to one reader.
 */
import {
  defineCompositeResource,
  type AuthorizationTitle,
} from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';

import { readerVisibleReference } from './library-record-access.ts';
import {
  APP_NAMESPACE,
  documentCreateFields,
  documentFields,
  documentUpdateFields,
  shareCreateFields,
  shareFields,
  type LibraryDocument,
  type LibraryDocumentShare,
} from './library-types.ts';

const t = (key: string): AuthorizationTitle => ({ key, ns: APP_NAMESPACE });

/**
 * Read every document the caller can see: the records they own, or, for a
 * reader, the published and explicitly shared ones. `library.readerVisible` is
 * offered on no write action, so selecting it can never widen an edit.
 */
export const documentRead = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocument>('documents')
    .title(t('library.permissions.documentRead'))
    .options(recordAccess.recordsIOwn, readerVisibleReference())
    .read(documentFields),
);

/**
 * Create a document. Record access is not applied to a create, so the route is
 * what binds the new row to the signed-in account; this declares the writable
 * fields and offers only the owner scope.
 */
export const documentCreate = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocument>('documents')
    .title(t('library.permissions.documentCreate'))
    .options(recordAccess.recordsIOwn)
    .read(documentFields)
    .create(documentCreateFields),
);

/**
 * Edit a document the caller owns. The read half exists because Repository
 * resolves its read context before updating; it is scoped to the same owned
 * records, so it grants nothing extra.
 */
export const documentUpdate = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocument>('documents')
    .title(t('library.permissions.documentUpdate'))
    .options(recordAccess.recordsIOwn)
    .read(documentFields)
    .update(documentUpdateFields),
);

/** Delete a document the caller owns. */
export const documentDelete = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocument>('documents')
    .title(t('library.permissions.documentDelete'))
    .options(recordAccess.recordsIOwn)
    .read(documentFields)
    .delete(),
);

/**
 * Manage the shares on one document. Every share is visible to whoever holds
 * this permission, which is why only root's permission set contains it.
 */
export const documentShare = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocumentShare>('documentShares')
    .title(t('library.permissions.documentShare'))
    .options(recordAccess.allRecords)
    .read(shareFields)
    .create(shareCreateFields)
    .delete(),
);

/** The documents themselves: read, create, edit and delete. */
export const libraryDocuments = defineCompositeResource(
  'library.documents',
  (resource) =>
    resource
      .title(t('library.composites.documents'))
      .action('view', (action) => action.grant('documents', documentRead))
      .action('create', (action) => action.grant('documents', documentCreate))
      .action('edit', (action) => action.grant('documents', documentUpdate))
      .action('delete', (action) => action.grant('documents', documentDelete)),
);

/**
 * Temporarily opening one draft to one account, and revoking it again. The
 * composite exists so root holds it as its own capability; the scope key is
 * untyped data the routes read back as a `documentShares` policy.
 */
export const libraryShares = defineCompositeResource(
  'library.shares',
  (resource) =>
    resource
      .title(t('library.composites.shares'))
      .action('manage', (action) => action.grant('shares', documentShare)),
);
