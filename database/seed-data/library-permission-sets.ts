import { permissionSet } from '@nocobase/authorization/permissions';

import {
  MATERIAL_RESOURCE_ID,
  MATERIAL_SCOPE_KEY,
  materialResource,
} from '../../server/library/authorization.ts';

/**
 * The two job permission sets the library ships with. They are values, not
 * registrations: the seed persists them, and an administrator can edit them
 * afterwards in the authorization backend.
 *
 * Both sets select the `recordsIOwn` built-in record-access policy for the
 * editor's actions, so A may maintain its own materials. The reader set only
 * grants `view` with no record scope of its own, so what B reads is decided
 * entirely by the seeded Default Access, Sharing and Restriction Rules.
 */
const libraryPageGrant = {
  resource: { type: 'page', id: MATERIAL_RESOURCE_ID },
  actions: [{ action: 'access' }],
} as const;

export const libraryEditorPermissionSet = permissionSet('library-editor')
  .title('Library editor')
  .grant(libraryPageGrant)
  .grant(
    materialResource.reference().grant({
      view: { [MATERIAL_SCOPE_KEY]: 'recordsIOwn' },
      create: { [MATERIAL_SCOPE_KEY]: 'recordsIOwn' },
      edit: { [MATERIAL_SCOPE_KEY]: 'recordsIOwn' },
      delete: { [MATERIAL_SCOPE_KEY]: 'recordsIOwn' },
    }),
  )
  .build();

export const libraryReaderPermissionSet = permissionSet('library-reader')
  .title('Library reader')
  .grant(libraryPageGrant)
  .grant(materialResource.reference().grant('view'))
  .build();

export const libraryPermissionSets = [
  libraryEditorPermissionSet,
  libraryReaderPermissionSet,
] as const;
