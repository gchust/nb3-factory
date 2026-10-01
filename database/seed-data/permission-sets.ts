/**
 * The document library's two business roles, declared as data so a seed can
 * persist them and the backend can edit them afterwards.
 *
 * Both roles hold the same page and the same `library.documents` resource;
 * what separates them is the record-access selection bound to the `documents`
 * scope. A maintainer selects `recordsIOwn` on every action, a reader selects
 * `library.readerVisible` on `view` and holds no write action at all.
 */
import { recordAccess } from '@nocobase/app-plugin-authorization/server';
import type { PermissionGrant } from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';

// The seed loader imports this file with Node's native TypeScript support, which resolves only the extension that is
// actually on disk. `allowImportingTsExtensions` and `rewriteRelativeImportExtensions` turn these back into `.js` in
// the compiled output, so the same specifier works in development and in `dist`.
import { READER_VISIBLE_KEY } from '../../server/library-record-access.ts';
import { libraryDocuments } from '../../server/library-resources.ts';
import { APP_NAMESPACE } from '../../server/library-types.ts';

/** The page id the client route declares for `/library`. */
export const LIBRARY_PAGE_ID = 'library.documents';

export const MAINTAINER_SET_KEY = 'library.maintainer';
export const READER_SET_KEY = 'library.reader';

/**
 * The `page.access` grant, built by hand because `authz.pages.grant` is a
 * runtime API and these declarations are data. The shape is the one the pages
 * plugin declares: a `page` resource with a single `access` action.
 */
function pageAccess(id: string): PermissionGrant {
  return { resource: { type: 'page', id }, actions: [{ action: 'access' }] };
}

/** The owner and author of documents; may create, edit and delete their own. */
export const maintainerPermissionSet = definePermissionSet(MAINTAINER_SET_KEY)
  .title({ key: 'library.permissionSets.maintainer', ns: APP_NAMESPACE })
  .grant(
    pageAccess(LIBRARY_PAGE_ID),
    libraryDocuments.reference().grant({
      view: { documents: recordAccess.recordsIOwn.key },
      create: { documents: recordAccess.recordsIOwn.key },
      edit: { documents: recordAccess.recordsIOwn.key },
      delete: { documents: recordAccess.recordsIOwn.key },
    }),
  )
  .build();

/** A colleague who reads; sees published and shared records and may not edit. */
export const readerPermissionSet = definePermissionSet(READER_SET_KEY)
  .title({ key: 'library.permissionSets.reader', ns: APP_NAMESPACE })
  .grant(
    pageAccess(LIBRARY_PAGE_ID),
    libraryDocuments
      .reference()
      .grant({ view: { documents: READER_VISIBLE_KEY } }),
  )
  .build();
