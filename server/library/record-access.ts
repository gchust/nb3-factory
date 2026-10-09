import { defineRecordAccess } from '@nocobase/authorization/core';
import { buildFilter } from '@nocobase/repository-input';
import { APP_NAMESPACE, LIBRARY_COLLECTION } from './resources.js';
import type { LibraryDocument } from './resources.js';

/**
 * Record access resolvers backing the `library.documents` data scopes.
 *
 * A resolver returns a filter on the Collection's own columns, or `false` when
 * the identity has no such records. Confidential documents are kept out of
 * every scope except ownership, so the only way a reader can see one is for a
 * grant to hand it over and for no restriction rule to exclude it.
 */

const publishedFilter = () =>
  buildFilter<LibraryDocument>((f) =>
    f.and([
      f.boolean('published').isTrue(),
      f.boolean('confidential').isFalse(),
    ]),
  );

/** Documents the user owns, whatever their flags. */
export const ownedDocumentsAccess = defineRecordAccess(
  'library.owned',
  (access) =>
    access
      .title({ key: 'library.access.owned', ns: APP_NAMESPACE })
      .collections(LIBRARY_COLLECTION)
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? buildFilter<LibraryDocument>((f) =>
              f.string('ownerId').eq(principal.id),
            )
          : false,
      ),
);

/** Published, non-confidential documents: the open shelf. */
export const publishedDocumentsAccess = defineRecordAccess(
  'library.published',
  (access) =>
    access
      .title({ key: 'library.access.published', ns: APP_NAMESPACE })
      .collections(LIBRARY_COLLECTION)
      .resolver(() => publishedFilter()),
);

/** Owned or open-shelf: what the librarian herself may read. */
export const readableDocumentsAccess = defineRecordAccess(
  'library.readable',
  (access) =>
    access
      .title({ key: 'library.access.readable', ns: APP_NAMESPACE })
      .collections(LIBRARY_COLLECTION)
      .resolver(({ principal }) => {
        const published = publishedFilter();
        if (principal.type !== 'user') return published;
        return buildFilter<LibraryDocument>((f) =>
          f.or([
            f.string('ownerId').eq(principal.id),
            f.and([
              f.boolean('published').isTrue(),
              f.boolean('confidential').isFalse(),
            ]),
          ]),
        );
      }),
);

/**
 * Non-confidential documents. The restriction rule assigned to a reader
 * intersects the reader's scope with this one, so a confidential document
 * stays hidden even after a sharing rule grants it.
 */
export const nonConfidentialDocumentsAccess = defineRecordAccess(
  'library.nonConfidential',
  (access) =>
    access
      .title({ key: 'library.access.nonConfidential', ns: APP_NAMESPACE })
      .collections(LIBRARY_COLLECTION)
      .resolver(() =>
        buildFilter<LibraryDocument>((f) =>
          f.boolean('confidential').isFalse(),
        ),
      ),
);

export const libraryRecordAccess = [
  ownedDocumentsAccess,
  publishedDocumentsAccess,
  readableDocumentsAccess,
  nonConfidentialDocumentsAccess,
];
