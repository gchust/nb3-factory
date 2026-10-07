import {
  defineCompositeResource,
  defineRecordAccess,
  type PermissionGrant,
} from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import { buildFilter } from '@nocobase/repository-input';

/**
 * The document library's authorization declarations.
 *
 * This module keeps no application or plugin instance: it only builds the
 * definitions a provider registers during `boot()`. Nothing here is registered
 * on import, so a migration, a test and the running application all see the
 * same declarations through the same path.
 */

/** The localization namespace this application's own strings live in. */
const NS = 'nb3-factory';

/**
 * A title the Authorization workspace renders in the reader's own language.
 * Every string here is one an administrator reads in Settings, so each is a key
 * in this application's locale files rather than the English it was written in.
 * The provider that declares the collection and the workspace section uses the
 * same helper, so one string never has two spellings.
 */
export function libraryTitle(key: string): {
  readonly key: string;
  readonly ns: string;
} {
  return { key: `library.authorization.${key}`, ns: NS };
}

const title = libraryTitle;

/** The page a qualified colleague opens. Stored page grants reference this id. */
export const LIBRARY_PAGE_ID = 'library.documents';
/** The composite resource whose actions the permission workspace configures. */
export const LIBRARY_RESOURCE_ID = 'library.documents';
/** The Collection the data scopes select records from. */
export const LIBRARY_COLLECTION = 'documents';
/** The single data scope key every library action binds its records under. */
export const LIBRARY_SCOPE = 'documents';

/** Record access a reader may choose: published and not confidential. */
export const PUBLISHED_RECORD_ACCESS = 'library.published';
/** Record access the confidentiality restriction enforces for a reader. */
export const NOT_CONFIDENTIAL_RECORD_ACCESS = 'library.notConfidential';

export const LIBRARY_MAINTAINER_SET = 'library.maintainer';
export const LIBRARY_READER_SET = 'library.reader';

/** The confidentiality rule that keeps 乙 out of 保密 documents even if shared. */
export const LIBRARY_RESTRICTION_KEY = 'library.reader.notConfidential';

const readableFields = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
] as const;
const writableFields = ['title', 'body', 'published', 'confidential'] as const;

/** Published, non-confidential documents are readable by any qualified colleague. */
export const publishedRecordAccess = defineRecordAccess(
  PUBLISHED_RECORD_ACCESS,
  (access) =>
    access
      .title(title('recordAccess.published'))
      .collections(LIBRARY_COLLECTION)
      .resolver(() =>
        buildFilter((filter) =>
          filter.and([
            filter.boolean('published').isTrue(),
            filter.boolean('confidential').isFalse(),
          ]),
        ),
      ),
);

/** A restriction selection: everything that is not confidential. */
export const notConfidentialRecordAccess = defineRecordAccess(
  NOT_CONFIDENTIAL_RECORD_ACCESS,
  (access) =>
    access
      .title(title('recordAccess.notConfidential'))
      .collections(LIBRARY_COLLECTION)
      .resolver(() =>
        buildFilter((filter) => filter.boolean('confidential').isFalse()),
      ),
);

const documentViewPermission = defineDatabasePermission((permission) =>
  permission
    .collection(LIBRARY_COLLECTION)
    .title(title('permission.view'))
    .options(recordAccess.recordsIOwn, publishedRecordAccess.reference())
    .default(recordAccess.recordsIOwn)
    .read(readableFields),
);

const documentCreatePermission = defineDatabasePermission((permission) =>
  permission
    .collection(LIBRARY_COLLECTION)
    .title(title('permission.create'))
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read(readableFields)
    .create([...writableFields, 'ownerId', 'id']),
);

const documentEditPermission = defineDatabasePermission((permission) =>
  permission
    .collection(LIBRARY_COLLECTION)
    .title(title('permission.edit'))
    .options(recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .read(readableFields)
    .update(writableFields),
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
      .title(title('resource'))
      .action('view', (action) =>
        action
          .title(title('permission.view'))
          .grant(LIBRARY_SCOPE, documentViewPermission),
      )
      .action('create', (action) =>
        action
          .title(title('permission.create'))
          .grant(LIBRARY_SCOPE, documentCreatePermission),
      )
      .action('edit', (action) =>
        action
          .title(title('permission.edit'))
          .grant(LIBRARY_SCOPE, documentEditPermission),
      ),
);

/** 甲 maintains their own documents: view, create and edit, all scoped to them. */
export function libraryMaintainerGrant(): PermissionGrant {
  return libraryDocuments.reference().grant({
    view: { documents: recordAccess.recordsIOwn.key },
    create: { documents: recordAccess.allRecords.key },
    edit: { documents: recordAccess.recordsIOwn.key },
  });
}

/** 乙 reads published, non-confidential documents — and has no edit grant at all. */
export function libraryReaderGrant(): PermissionGrant {
  return libraryDocuments.reference().grant({
    view: { documents: PUBLISHED_RECORD_ACCESS },
  });
}
