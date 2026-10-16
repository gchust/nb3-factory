import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';

import type { LibraryDocumentRecord } from './domain.js';

/**
 * The document library's permission model, as portable declarations.
 *
 * Code defines what the business supports — the document actions and the
 * record selections each accepts — while the entities that grant it (Permission
 * Sets, Sharing Rules, Restriction Rules) live in the seeds and the
 * authorization backend, where an administrator can change them.
 *
 * Nothing here registers or persists anything: the provider registers these
 * declarations at boot, the seeds reference them by key, and the routes resolve
 * every read and write through the resulting Repository Policy.
 */

/** The page a qualified colleague opens. Stored page grants reference this id. */
export const LIBRARY_PAGE_ID = 'library.documents';
/** The composite resource whose actions the permission workspace configures. */
export const LIBRARY_RESOURCE_ID = 'library.documents';
/** The Collection the data scopes select records from. */
export const LIBRARY_COLLECTION = 'documents';
/** The single data scope key every library action binds its records under. */
export const LIBRARY_SCOPE = 'documents';

/** Record access a reader may choose: every published document. */
export const PUBLISHED_RECORD_ACCESS = 'library.published';
/** Record access the confidentiality restriction intersects a reader with. */
export const NOT_CONFIDENTIAL_RECORD_ACCESS = 'library.notConfidential';

export const LIBRARY_MAINTAINER_SET = 'library.maintainer';
export const LIBRARY_READER_SET = 'library.reader';

/** The settings permission that governs Sharing Rules, and so the share panel. */
export const SHARING_RULES_SETTINGS = 'authorization.sharing-rules';

/** The confidentiality rule that keeps 乙 out of 保密 documents even if shared. */
export const LIBRARY_RESTRICTION_KEY = 'library.reader.notConfidential';

/** The prefix of the per-document Sharing Rule an administrator creates. */
export const LIBRARY_SHARE_PREFIX = 'library.share';

const READ_FIELDS = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const;

const WRITE_FIELDS = [
  'title',
  'body',
  'published',
  'confidential',
  'updatedAt',
] as const;

/**
 * Every published document. This is the reader's own data scope: a reader
 * reaches anything published, and the confidentiality restriction — not this
 * scope — is what keeps a published-but-confidential document out.
 */
export const publishedRecordAccess = defineRecordAccess(
  PUBLISHED_RECORD_ACCESS,
  (access) =>
    access
      .title('Published documents')
      .collections(LIBRARY_COLLECTION)
      .resolver(() => condition('published', '$isTruly')),
);

/** A restriction selection: everything that is not confidential. */
export const notConfidentialRecordAccess = defineRecordAccess(
  NOT_CONFIDENTIAL_RECORD_ACCESS,
  (access) =>
    access
      .title('Not confidential')
      .collections(LIBRARY_COLLECTION)
      .resolver(() => condition('confidential', '$isFalsy')),
);

const documentViewPermission = defineDatabasePermission<
  LibraryDocumentRecord,
  string
>((permission) =>
  permission
    .collection<LibraryDocumentRecord>(LIBRARY_COLLECTION)
    .title('View documents')
    .options(
      recordAccess.allRecords,
      recordAccess.recordsIOwn,
      publishedRecordAccess.reference(),
    )
    .default(recordAccess.recordsIOwn)
    .read(READ_FIELDS),
);

const documentCreatePermission = defineDatabasePermission<
  LibraryDocumentRecord,
  string
>((permission) =>
  permission
    .collection<LibraryDocumentRecord>(LIBRARY_COLLECTION)
    .title('Create documents')
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read(READ_FIELDS)
    .create('*'),
);

const documentEditPermission = defineDatabasePermission<
  LibraryDocumentRecord,
  string
>((permission) =>
  permission
    .collection<LibraryDocumentRecord>(LIBRARY_COLLECTION)
    .title('Edit documents')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .read(READ_FIELDS)
    .update(WRITE_FIELDS),
);

/**
 * `library.documents` with `view`, `create` and `edit`. Reading never implies
 * editing: `edit` is a separate action, and the reader's Permission Set simply
 * does not grant it.
 */
export const libraryDocuments = defineCompositeResource(
  LIBRARY_RESOURCE_ID,
  (resource) =>
    resource
      .title('Documents')
      .action('view', (action) =>
        action
          .title('View documents')
          .grant(LIBRARY_SCOPE, documentViewPermission),
      )
      .action('create', (action) =>
        action
          .title('Create documents')
          .grant(LIBRARY_SCOPE, documentCreatePermission),
      )
      .action('edit', (action) =>
        action
          .title('Edit documents')
          .grant(LIBRARY_SCOPE, documentEditPermission),
      ),
);
