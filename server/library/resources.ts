import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
import type { RecordAccessReference } from '@nocobase/authorization/core';

/**
 * Portable declarations of the document library's business operation.
 *
 * This module is imported by the feature provider (registration) and by the
 * seed-data modules (initial permission sets). It must stay free of database
 * queries and runtime services so both can reuse it.
 */

/** The browser locale namespace of this application, used for persisted titles. */
export const APP_NAMESPACE = 'nb3-factory';

/** The one collection this feature owns. */
export const LIBRARY_COLLECTION = 'libraryDocuments';

export interface LibraryDocument {
  id: string;
  title: string;
  body: string | null;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const LIBRARY_READ_FIELDS: readonly (keyof LibraryDocument)[] = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
];

/**
 * Record access the composite's data scopes offer. Referenced here as plain
 * serializable references; the resolvers are registered by the provider.
 */
export const ownedDocuments: RecordAccessReference<'library.owned'> = {
  key: 'library.owned',
  collections: [LIBRARY_COLLECTION],
};

/** Published and not confidential: what any qualified colleague may read. */
export const publishedDocuments: RecordAccessReference<'library.published'> = {
  key: 'library.published',
  collections: [LIBRARY_COLLECTION],
};

/** Owned, or published and not confidential: the librarian's reading scope. */
export const readableDocuments: RecordAccessReference<'library.readable'> = {
  key: 'library.readable',
  collections: [LIBRARY_COLLECTION],
};

/** Not confidential. The restriction rule assigned to a reader intersects with this. */
export const nonConfidentialDocuments: RecordAccessReference<'library.nonConfidential'> =
  { key: 'library.nonConfidential', collections: [LIBRARY_COLLECTION] };

const libraryResourceTitle = {
  key: 'library.resource.title',
  ns: APP_NAMESPACE,
} as const;

const readPermission = defineDatabasePermission((p) =>
  p
    .collection<LibraryDocument>(LIBRARY_COLLECTION)
    .title(libraryResourceTitle)
    .read([...LIBRARY_READ_FIELDS]),
);

const createPermission = defineDatabasePermission((p) =>
  p
    .collection<LibraryDocument>(LIBRARY_COLLECTION)
    .title(libraryResourceTitle)
    // Server-written columns are in the writable allowlist because the route
    // writes them through this policy; the request body cannot name them.
    .create([
      // `id`, `ownerId` and the timestamps are server-written; the request body
      // cannot name them, but the policy has to allow the handler to write them.
      'id',
      'title',
      'body',
      'published',
      'confidential',
      'ownerId',
      'createdAt',
      'updatedAt',
    ]),
);

const updatePermission = defineDatabasePermission((p) =>
  p
    .collection<LibraryDocument>(LIBRARY_COLLECTION)
    .title(libraryResourceTitle)
    .update(['title', 'body', 'published', 'confidential', 'updatedAt']),
);

const deletePermission = defineDatabasePermission((p) =>
  p
    .collection<LibraryDocument>(LIBRARY_COLLECTION)
    .title(libraryResourceTitle)
    .delete(),
);

/** `create` ignores record scopes; the key still has to exist and be offered. */
const allRecords: RecordAccessReference<'allRecords'> = {
  key: 'allRecords',
  collections: ['*'],
};

/**
 * The document library business operation. `library.documents` is registered
 * by the feature provider under its own workspace subsection so the backend's
 * sharing and restriction screens can configure it record by record.
 *
 * Reading and writing are separate actions, so a grant that lets a colleague
 * read a document never carries the ability to change it.
 */
export const libraryDocuments = defineCompositeResource(
  'library.documents',
  (resource) =>
    resource
      .title(libraryResourceTitle)
      .action('view', (action) =>
        action
          .title({ key: 'library.action.view', ns: APP_NAMESPACE })
          .grant(
            'documents',
            readPermission.options(
              ownedDocuments,
              publishedDocuments,
              readableDocuments,
              nonConfidentialDocuments,
            ),
            { title: { key: 'library.scope.documents', ns: APP_NAMESPACE } },
          ),
      )
      .action('create', (action) =>
        action
          .title({ key: 'library.action.create', ns: APP_NAMESPACE })
          .grant(
            'documents',
            createPermission.options(allRecords).default(allRecords),
            { title: { key: 'library.scope.documents', ns: APP_NAMESPACE } },
          ),
      )
      .action('edit', (action) =>
        action
          .title({ key: 'library.action.edit', ns: APP_NAMESPACE })
          .grant(
            'documents',
            updatePermission.options(ownedDocuments).default(ownedDocuments),
            { title: { key: 'library.scope.documents', ns: APP_NAMESPACE } },
          ),
      )
      .action('delete', (action) =>
        action
          .title({ key: 'library.action.delete', ns: APP_NAMESPACE })
          .grant(
            'documents',
            deletePermission.options(ownedDocuments).default(ownedDocuments),
            { title: { key: 'library.scope.documents', ns: APP_NAMESPACE } },
          ),
      ),
);
