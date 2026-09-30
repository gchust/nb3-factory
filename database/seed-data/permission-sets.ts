import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { materialsLibrary } from '../../server/materials-resources.ts';

/** The locale namespace the application registers its own wording under. */
const NS = 'nb3-factory';

const materialsPage = {
  resource: { type: 'page', id: 'materials' },
  actions: [{ action: 'access' }],
};
const assistantPage = {
  resource: { type: 'page', id: 'materials.assistant' },
  actions: [{ action: 'access' }],
};

/**
 * The supervisor keeps every material, including confidential ones, and may
 * create, edit and remove them.
 */
export const materialsSupervisorSet = definePermissionSet(
  'materials-supervisor',
)
  .title({ key: 'materials.permissionSet.supervisor', ns: NS })
  .grant(materialsPage, assistantPage)
  .grant(
    materialsLibrary.reference().grant({
      view: { materials: 'allRecords' },
      manage: { materials: 'allRecords' },
    }),
  )
  .build();

/**
 * A regular colleague reads public material only. It carries no `manage`
 * grant, so creating, editing or removing a record is denied on the server no
 * matter what the page offers.
 */
export const materialsColleagueSet = definePermissionSet('materials-colleague')
  .title({ key: 'materials.permissionSet.colleague', ns: NS })
  .grant(materialsPage, assistantPage)
  .grant(
    materialsLibrary
      .reference()
      .grant({ view: { materials: 'materials.public' } }),
  )
  .build();

/** The permission sets the installer writes, in display order. */
export const materialsPermissionSets = [
  materialsSupervisorSet,
  materialsColleagueSet,
];
