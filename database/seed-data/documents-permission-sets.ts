import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import {
  ALL_SCOPE,
  STAFF_SCOPE,
  documents,
} from '../../server/documents-resources.ts';

/**
 * Page grants are declared here even though the documents and assistant routes are reachable by every
 * signed-in user: the page ids still describe the feature in the authorization workspace, and a later
 * administrator can narrow them without touching code.
 */
const pageGrants = [
  {
    resource: { type: 'page', id: 'documents' },
    actions: [{ action: 'access' }],
  },
  {
    resource: { type: 'page', id: 'assistant' },
    actions: [{ action: 'access' }],
  },
];

/** A supervisor reads and edits every document, including the supervisor-only one. */
export const documentsSupervisor = definePermissionSet('documents-supervisor')
  .title({ key: 'permissionSets.documentsSupervisor', ns: 'nb3-factory' })
  .grant(...pageGrants)
  .grant(
    documents.reference().grant({
      read: { documents: ALL_SCOPE },
      edit: { documents: ALL_SCOPE },
    }),
  )
  .build();

/** A colleague reads only the shared documents; the supervisor scope is not granted at all. */
export const documentsStaff = definePermissionSet('documents-staff')
  .title({ key: 'permissionSets.documentsStaff', ns: 'nb3-factory' })
  .grant(...pageGrants)
  .grant(
    documents.reference().grant({
      read: { documents: STAFF_SCOPE },
    }),
  )
  .build();
