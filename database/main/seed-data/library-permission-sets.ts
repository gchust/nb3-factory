import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import {
  LIBRARY_NAMESPACE,
  MANAGER_PERMISSION_SET,
  READER_PERMISSION_SET,
  libraryDocuments,
} from '../../../server/library/documents.ts';

/**
 * The initial Permission Sets for the document library.
 *
 * Declared as values so a seed can persist them and an administrator can keep
 * editing them afterwards. The grants name the composite actions and record
 * accesses the server already enforces; nothing here widens the model.
 */

function label(key: string) {
  return { key, ns: LIBRARY_NAMESPACE };
}

/** Page access is separate from record access, so every set grants it directly. */
const pageGrant = {
  resource: { type: 'page', id: 'library.documents' },
  actions: [{ action: 'access' }],
};

/** Maintains documents: every action on the whole collection. */
export const managerPermissionSet = definePermissionSet(MANAGER_PERMISSION_SET)
  .title(label('library.permissionSet.manager'))
  .grant(pageGrant)
  .grant(
    libraryDocuments.reference().grant({
      view: { documents: 'allRecords' },
      create: { documents: 'allRecords' },
      edit: { documents: 'allRecords' },
      delete: { documents: 'allRecords' },
    }),
  )
  .build();

/** Reads published, non-confidential documents only. */
export const readerPermissionSet = definePermissionSet(READER_PERMISSION_SET)
  .title(label('library.permissionSet.reader'))
  .grant(pageGrant)
  .grant(
    libraryDocuments.reference().grant({
      view: { documents: 'library.published' },
    }),
  )
  .build();
