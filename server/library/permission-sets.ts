import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import {
  definePermissionSet,
  type PermissionSet,
} from '@nocobase/authorization/permission-sets';

import {
  DOCUMENT_SCOPES,
  DOCUMENTS_PAGE,
  libraryDocuments,
} from './resources.js';

/**
 * The jobs the document library ships with.
 *
 * A permission set is a value, not an assignment: `.build()` persists nothing.
 * The provisioning routine in `provision.ts` is what writes the first copy and
 * assigns it, and it never overwrites a set an administrator has edited.
 */
export const LIBRARY_MAINTAINER_SET = 'library-maintainer';
export const LIBRARY_READER_SET = 'library-reader';

/** The client i18n namespace this application translates its own text under. */
const NAMESPACE = 'nb3-factory';

function text(key: string): { key: string; ns: string } {
  return { key, ns: NAMESPACE };
}

const documents = libraryDocuments.reference();

/**
 * The professional maintainer: full document CRUD, but only over the records
 * they own. `create` is granted on the same own-records scope, which is what
 * lets the server stamp the creator as the owner and nothing else.
 */
function maintainer(authz: AppAuthorization): PermissionSet {
  return definePermissionSet(LIBRARY_MAINTAINER_SET)
    .title(text('library.permissionSet.maintainer'))
    .grant(authz.pages.grant(DOCUMENTS_PAGE))
    .grant(
      documents.grant({
        create: { documents: DOCUMENT_SCOPES.own },
        delete: { documents: DOCUMENT_SCOPES.own },
        edit: { documents: DOCUMENT_SCOPES.own },
        view: { documents: DOCUMENT_SCOPES.own },
      }),
    )
    .build();
}

/**
 * The reader: view only, and only records in the published scope. No create,
 * edit or delete action is granted at all, so an administrator cannot widen a
 * reader into an editor by editing a data scope — the action is absent from
 * the job's model.
 */
function reader(authz: AppAuthorization): PermissionSet {
  return definePermissionSet(LIBRARY_READER_SET)
    .title(text('library.permissionSet.reader'))
    .grant(authz.pages.grant(DOCUMENTS_PAGE))
    .grant(documents.grant({ view: { documents: DOCUMENT_SCOPES.published } }))
    .build();
}

/** Every permission set this feature declares. Valid only while `authz` is live. */
export function buildLibraryPermissionSets(
  authz: AppAuthorization,
): readonly PermissionSet[] {
  return [maintainer(authz), reader(authz)];
}
