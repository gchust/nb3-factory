import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { materials } from '../../server/materials/resources.ts';

/**
 * The supervisor keeps the whole reference library and may edit it. The
 * composite's `manage` action is what unlocks the edit form; `read` with
 * `allRecords` also lets the supervisor open the supervisor-only material.
 */
export const materialsSupervisor = definePermissionSet('materials-supervisor')
  .title('主管')
  .grant(
    materials.reference().grant({
      read: { materials: 'allRecords' },
      manage: { materials: 'allRecords' },
    }),
  )
  .build();

/**
 * A regular colleague reads only the public materials, on the page and through
 * the assistant alike. Nothing grants a write, so the assistant is read-only
 * for this role.
 */
export const materialsColleague = definePermissionSet('materials-colleague')
  .title('普通同事')
  .grant(
    materials.reference().grant({
      read: { materials: 'materials.public' },
    }),
  )
  .build();

export const materialPermissionSets = [materialsSupervisor, materialsColleague];
