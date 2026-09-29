import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import {
  MATERIALS_MANAGER_SET,
  MATERIALS_NAMESPACE,
  MATERIALS_PAGES,
  MATERIALS_STAFF_SET,
  materialsDirectory,
  pageAccessGrant,
} from '../../server/materials/resources.ts';

/**
 * The supervisor set: sees the read page, the management page and the
 * assistant, and may read and write every material including confidential ones.
 */
export const materialsManagerPermissionSet = definePermissionSet(
  MATERIALS_MANAGER_SET,
)
  .title({ key: 'materials.permissionSets.manager', ns: MATERIALS_NAMESPACE })
  .grant(
    pageAccessGrant(MATERIALS_PAGES.read),
    pageAccessGrant(MATERIALS_PAGES.manage),
    pageAccessGrant(MATERIALS_PAGES.assistant),
  )
  .grant(
    materialsDirectory.grant({
      view: { records: 'allRecords' },
      manage: { records: 'allRecords' },
    }),
  )
  .build();

/**
 * The ordinary colleague set: sees the read page and the assistant, and may
 * read only records selected by the `materials.visible` record access. It
 * carries no `manage` grant at all, so C is invisible on the page, through the
 * read API and through the assistant tool.
 */
export const materialsStaffPermissionSet = definePermissionSet(
  MATERIALS_STAFF_SET,
)
  .title({ key: 'materials.permissionSets.staff', ns: MATERIALS_NAMESPACE })
  .grant(
    pageAccessGrant(MATERIALS_PAGES.read),
    pageAccessGrant(MATERIALS_PAGES.assistant),
  )
  .grant(materialsDirectory.grant({ view: { records: 'materials.visible' } }))
  .build();

export const materialsPermissionSets = [
  materialsManagerPermissionSet,
  materialsStaffPermissionSet,
] as const;
