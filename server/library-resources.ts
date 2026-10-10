import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  defineRecordAccess,
  type AuthorizationTitle,
} from '@nocobase/authorization/core';
import { buildFilter } from '@nocobase/repository-input';

/**
 * The internal document library's portable authorization declarations.
 *
 * Nothing here registers itself or touches the database: the owning provider
 * registers these definitions at boot, and the installation seeds persist the
 * initial permission configuration built from the same references. Keeping the
 * declaration free of the container lets a seed import it too.
 */

/** The application package name, which is also its i18n namespace. */
const APP_NAMESPACE = 'nb3-factory';

/** A title the browser resolves from the application's own locale resources. */
export const libraryTitle = (key: string): AuthorizationTitle => ({
  key,
  ns: APP_NAMESPACE,
});

export const LIBRARY_DOCUMENTS_COLLECTION = 'libraryDocuments';

/** The page and the composite share one id: the feature a signed-in user may open. */
export const LIBRARY_RESOURCE_ID = 'library.documents';

export interface LibraryDocumentRow {
  readonly id: string;
  readonly title: string;
  readonly content: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
}

const READ_FIELDS = [
  'id',
  'title',
  'content',
  'ownerId',
  'ownerName',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof LibraryDocumentRow)[];

// `createdAt`/`updatedAt` are written by the server rather than by the database,
// so a create or update grant has to allow them explicitly.
const CREATE_FIELDS = [
  'id',
  'title',
  'content',
  'published',
  'confidential',
  'ownerId',
  'ownerName',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof LibraryDocumentRow)[];

const UPDATE_FIELDS = [
  'title',
  'content',
  'published',
  'confidential',
  'updatedAt',
] as const satisfies readonly (keyof LibraryDocumentRow)[];

/** Records the current user owns. */
export const libraryOwned = defineRecordAccess('library.owned', (access) =>
  access
    .title(libraryTitle('library.recordAccess.owned'))
    .collections(LIBRARY_DOCUMENTS_COLLECTION)
    .resolver(({ principal }) =>
      principal.type === 'user'
        ? buildFilter((filter) => filter.string('ownerId').eq(principal.id))
        : false,
    ),
);

/**
 * Records every colleague may read: the ones they own, plus the published,
 * non-confidential ones. An unpublished draft is therefore visible only to the
 * person who owns it until an administrator shares it.
 */
export const libraryVisible = defineRecordAccess('library.visible', (access) =>
  access
    .title(libraryTitle('library.recordAccess.visible'))
    .collections(LIBRARY_DOCUMENTS_COLLECTION)
    .resolver(({ principal }) =>
      principal.type === 'user'
        ? buildFilter((filter) =>
            filter.or([
              filter.string('ownerId').eq(principal.id),
              filter.and([
                filter.boolean('published').isTrue(),
                filter.boolean('confidential').isFalse(),
              ]),
            ]),
          )
        : false,
    ),
);

/**
 * The invariant a confidentiality restriction intersects with: a confidential
 * document is never reached, whatever else grants it.
 */
export const libraryNonConfidential = defineRecordAccess(
  'library.nonConfidential',
  (access) =>
    access
      .title(libraryTitle('library.recordAccess.nonConfidential'))
      .collections(LIBRARY_DOCUMENTS_COLLECTION)
      .resolver(() =>
        buildFilter((filter) => filter.boolean('confidential').isFalse()),
      ),
);

export const libraryViewData = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocumentRow>(LIBRARY_DOCUMENTS_COLLECTION)
    .options(
      libraryVisible.reference(),
      libraryOwned.reference(),
      libraryNonConfidential.reference(),
    )
    .default(libraryVisible.reference())
    .read(READ_FIELDS),
);

export const libraryCreateData = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocumentRow>(LIBRARY_DOCUMENTS_COLLECTION)
    .options(libraryOwned.reference())
    .default(libraryOwned.reference())
    .read(READ_FIELDS)
    .create(CREATE_FIELDS),
);

export const libraryEditData = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocumentRow>(LIBRARY_DOCUMENTS_COLLECTION)
    .options(libraryOwned.reference())
    .default(libraryOwned.reference())
    .read(READ_FIELDS)
    .update(UPDATE_FIELDS),
);

export const libraryDeleteData = defineDatabasePermission((permission) =>
  permission
    .collection<LibraryDocumentRow>(LIBRARY_DOCUMENTS_COLLECTION)
    .options(libraryOwned.reference())
    .default(libraryOwned.reference())
    .read(READ_FIELDS)
    .delete(),
);

/**
 * The business operation a request authorizes once. Each action binds one data
 * scope named after the collection, so a rule can narrow exactly one action.
 */
export const library = defineCompositeResource(
  LIBRARY_RESOURCE_ID,
  (resource) =>
    resource
      .title(libraryTitle('library.resource.documents'))
      .action('view', (action) =>
        action
          .title(libraryTitle('library.action.view'))
          .grant(LIBRARY_DOCUMENTS_COLLECTION, libraryViewData, {
            title: libraryTitle('library.scope.view'),
          }),
      )
      .action('create', (action) =>
        action
          .title(libraryTitle('library.action.create'))
          .grant(LIBRARY_DOCUMENTS_COLLECTION, libraryCreateData, {
            title: libraryTitle('library.scope.create'),
          }),
      )
      .action('edit', (action) =>
        action
          .title(libraryTitle('library.action.edit'))
          .grant(LIBRARY_DOCUMENTS_COLLECTION, libraryEditData, {
            title: libraryTitle('library.scope.edit'),
          }),
      )
      .action('delete', (action) =>
        action
          .title(libraryTitle('library.action.delete'))
          .grant(LIBRARY_DOCUMENTS_COLLECTION, libraryDeleteData, {
            title: libraryTitle('library.scope.delete'),
          }),
      ),
);

/** Type-safe grants and rule targets for {@link library}. */
export const libraryReference = library.reference();
