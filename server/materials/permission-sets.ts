import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { recordAccess } from '@nocobase/app-plugin-authorization/server';
import {
  definePermissionSet,
  type PermissionSet,
} from '@nocobase/authorization/permission-sets';
import { MATERIALS_COLLECTION, materialsResource } from './resources.js';
import { MATERIALS_PUBLIC_SCOPE } from './record-access.js';

/** Page id the materials route declares; the grant has to name the same id. */
export const MATERIALS_PAGE_ID = 'materials';

/** The Permission Set every signed-in colleague holds. */
export const MATERIALS_EMPLOYEE_SET = 'materials.employee';
/** The Permission Set the supervisor holds. */
export const MATERIALS_SUPERVISOR_SET = 'materials.supervisor';

const materials = materialsResource.reference();

const pageAccess = {
  resource: { type: 'page', id: MATERIALS_PAGE_ID },
  actions: [{ action: 'access' }],
};

/**
 * Read the page and the non-confidential materials. The `view` scope names
 * `materials.public`, so `findMany`, `findOne` and `count` all return A and B
 * and never C, on the page and through the assistant alike.
 */
export const materialsEmployeePermissionSet: PermissionSet =
  definePermissionSet(MATERIALS_EMPLOYEE_SET)
    .title('Materials reader')
    .grant(
      pageAccess,
      materials.grant({
        view: { [MATERIALS_COLLECTION]: MATERIALS_PUBLIC_SCOPE },
      }),
    )
    .build();

/**
 * The supervisor reads every material — including confidential ones — and is
 * the only principal allowed to maintain them.
 */
export const materialsSupervisorPermissionSet: PermissionSet =
  definePermissionSet(MATERIALS_SUPERVISOR_SET)
    .title('Materials supervisor')
    .grant(
      pageAccess,
      materials.grant({
        view: { [MATERIALS_COLLECTION]: recordAccess.allRecords.key },
        create: { [MATERIALS_COLLECTION]: recordAccess.allRecords.key },
        edit: { [MATERIALS_COLLECTION]: recordAccess.allRecords.key },
        delete: { [MATERIALS_COLLECTION]: recordAccess.allRecords.key },
      }),
    )
    .build();

/** Permission Sets the application declares, for seeding and provisioning. */
export const materialsPermissionSets: readonly PermissionSet[] = [
  materialsEmployeePermissionSet,
  materialsSupervisorPermissionSet,
];

/**
 * Registers the sets with the authorization runtime. The store already holds
 * them from the seed; registering again is how a fresh or restored installation
 * gets them back, and the seed remains the record of what they contain.
 */
export async function registerMaterialsPermissionSets(
  authz: AppAuthorization,
): Promise<void> {
  for (const set of materialsPermissionSets) {
    const existing = await authz.permissionSets.get(set.key);
    if (!existing) {
      await authz.permissionSets.create({
        key: set.key,
        title: set.title,
        grants: [...set.grants],
      });
    }
  }
}
