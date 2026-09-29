import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import { buildFilter } from '@nocobase/repository-input';

/**
 * The document library's authorization model.
 *
 * This module is deliberately portable: it imports only declaration builders, never a database, container or HTTP
 * context, so the server provider and the installation seeds can share the exact same action names, data-scope keys
 * and record-access keys. Registration and persistence happen elsewhere.
 */

/** The application's own translation namespace, so titles resolve from `client/locales`. */
export const LIBRARY_NAMESPACE = 'nb3-factory';

/** The one business collection. */
export const MATERIALS_COLLECTION = 'materials';

/** The app page id that gates entry to the library. */
export const MATERIALS_PAGE = 'materials';

/** Data-scope key each action binds the collection with; the grant and rule target it. */
export const MATERIALS_SCOPE = 'materials';

/** Record-access keys. `recordsIOwn` is the platform's built-in owner scope. */
export const RECORD_ACCESS_OWNED = 'recordsIOwn';
export const RECORD_ACCESS_PUBLISHED = 'library.published';
export const RECORD_ACCESS_NON_CONFIDENTIAL = 'library.nonConfidential';

export interface Material {
  id: string;
  title: string;
  body: string | null;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const title = (key: string) => ({ key, ns: LIBRARY_NAMESPACE });

const READ_FIELDS = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof Material)[];

const CREATE_FIELDS = [
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof Material)[];

const UPDATE_FIELDS = [
  'title',
  'body',
  'published',
  'confidential',
  'updatedAt',
] as const satisfies readonly (keyof Material)[];

/** Published and not confidential — what an ordinary reader may see. */
export const publishedAccess = defineRecordAccess(
  RECORD_ACCESS_PUBLISHED,
  (access) =>
    access
      .title(title('library.recordAccess.published'))
      .collections(MATERIALS_COLLECTION)
      .resolver(() =>
        buildFilter((filter) =>
          filter.and([
            filter.boolean('published').isTrue(),
            filter.boolean('confidential').isFalse(),
          ]),
        ),
      ),
);

/** Anything not confidential — the invariant a reader's restriction rule is written against. */
export const nonConfidentialAccess = defineRecordAccess(
  RECORD_ACCESS_NON_CONFIDENTIAL,
  (access) =>
    access
      .title(title('library.recordAccess.nonConfidential'))
      .collections(MATERIALS_COLLECTION)
      .resolver(() =>
        buildFilter((filter) => filter.boolean('confidential').isFalse()),
      ),
);

const published = publishedAccess.reference();
const nonConfidential = nonConfidentialAccess.reference();

const titleOfCollection = title('library.materials');

const materialView = defineDatabasePermission((permission) =>
  permission
    .collection<Material>(MATERIALS_COLLECTION)
    .title(titleOfCollection)
    .read(READ_FIELDS)
    .options(recordAccess.recordsIOwn, published, nonConfidential)
    .default(recordAccess.recordsIOwn),
);

const materialCreate = defineDatabasePermission((permission) =>
  permission
    .collection<Material>(MATERIALS_COLLECTION)
    .title(titleOfCollection)
    .read(READ_FIELDS)
    .create(CREATE_FIELDS)
    .options(recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn),
);

const materialEdit = defineDatabasePermission((permission) =>
  permission
    .collection<Material>(MATERIALS_COLLECTION)
    .title(titleOfCollection)
    .read(READ_FIELDS)
    .update(UPDATE_FIELDS)
    .options(recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn),
);

const materialDelete = defineDatabasePermission((permission) =>
  permission
    .collection<Material>(MATERIALS_COLLECTION)
    .title(titleOfCollection)
    .read(READ_FIELDS)
    .delete()
    .options(recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn),
);

/**
 * The library's business operations: viewing, creating, editing and deleting documents.
 *
 * Every writer action also composes reading, so the record a write returns is authorized by the same decision, while
 * each action still exposes only the fields and operation it performs — a viewer grant can never be widened into a
 * writer one.
 */
export const materials = defineCompositeResource(
  'library.materials',
  (resource) =>
    resource
      .title(title('library.title'))
      .action('view', (action) =>
        action
          .title(title('library.action.view'))
          .grant(MATERIALS_SCOPE, materialView),
      )
      .action('create', (action) =>
        action
          .title(title('library.action.create'))
          .grant(MATERIALS_SCOPE, materialCreate),
      )
      .action('edit', (action) =>
        action
          .title(title('library.action.edit'))
          .grant(MATERIALS_SCOPE, materialEdit),
      )
      .action('delete', (action) =>
        action
          .title(title('library.action.delete'))
          .grant(MATERIALS_SCOPE, materialDelete),
      ),
);
