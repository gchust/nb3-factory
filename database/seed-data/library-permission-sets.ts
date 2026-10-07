import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import {
  LIBRARY_MAINTAINER_SET,
  LIBRARY_PAGE_ID,
  LIBRARY_READER_SET,
  libraryMaintainerGrant,
  libraryReaderGrant,
} from '../../server/library/authorization.ts';

/**
 * The two document-library jobs, as values a seed persists once.
 *
 * A seed has no authorization service, so the page grant is written in the
 * stored shape `authz.pages.grant()` produces, and the data grants come from
 * the same portable declarations the provider registers — a grant written here
 * cannot drift from the composite the server enforces.
 */

/** The localization namespace this application's own strings live in. */
const NS = 'nb3-factory';

/** The page a qualified colleague opens; the id matches the client route's `authz`. */
const pageGrant = {
  resource: { type: 'page', id: LIBRARY_PAGE_ID },
  actions: [{ action: 'access' }],
};

/**
 * 甲 maintains their own documents: view, create and edit, all scoped to them.
 *
 * The title is a localization descriptor in this application's namespace. The
 * Authorization settings render it through the translation of the reader's
 * language, and an unresolved key falls back to the key itself rather than to a
 * blank row, so a set added before its translation still identifies itself.
 */
export const libraryMaintainer = definePermissionSet(LIBRARY_MAINTAINER_SET)
  .title({ key: 'permissionSets.maintainer', ns: NS })
  .grant(pageGrant)
  .grant(libraryMaintainerGrant())
  .build();

/** 乙 reads published, non-confidential documents — and has no edit grant at all. */
export const libraryReader = definePermissionSet(LIBRARY_READER_SET)
  .title({ key: 'permissionSets.reader', ns: NS })
  .grant(pageGrant)
  .grant(libraryReaderGrant())
  .build();

/** Persisted in this order; each set is assigned to its account by the same seed. */
export const LIBRARY_PERMISSION_SETS = [libraryMaintainer, libraryReader];
