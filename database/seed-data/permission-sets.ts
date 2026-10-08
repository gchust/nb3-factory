import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import {
  APP_NAMESPACE,
  materialsComposite,
} from '../../server/authorization/materials.ts';

const materials = materialsComposite.reference();

/**
 * The supervisor maintains materials and sees every one of them.
 *
 * The page grant is what lets the route open; the composite grant is what the service enforces. `allRecords` on the
 * `view` scope is the whole difference from the colleague set.
 */
export const materialsSupervisor = definePermissionSet('materials-supervisor')
  .title({ key: 'materials.permission.supervisorSet', ns: APP_NAMESPACE })
  .grant({
    resource: { type: 'page', id: 'materials' },
    actions: [{ action: 'access' }],
  })
  .grant(
    materials.grant({
      view: { view: 'allRecords' },
      manage: { manage: 'allRecords' },
    }),
  )
  .build();

/**
 * A colleague reads only the materials that are not restricted, and maintains none of them.
 *
 * `materials.visible` is the named record access that resolves to `restricted = false`; the same grant applies on the
 * page and inside the assistant, so a colleague cannot reach the restricted material either way.
 */
export const materialsColleague = definePermissionSet('materials-colleague')
  .title({ key: 'materials.permission.colleagueSet', ns: APP_NAMESPACE })
  .grant({
    resource: { type: 'page', id: 'materials' },
    actions: [{ action: 'access' }],
  })
  .grant(materials.grant({ view: { view: 'materials.visible' } }))
  .build();
