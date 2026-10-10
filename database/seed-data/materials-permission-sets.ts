import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import {
  MATERIALS_NAMESPACE,
  materialsColleagueViewGrant,
  materialsPageGrant,
  materialsSupervisorEditGrant,
  materialsSupervisorViewGrant,
} from '../../server/materials/declaration.ts';

/**
 * The two job permission sets the installation starts from.
 *
 * They are ordinary persisted configuration: an administrator can change their
 * grants or assignments in the backend afterwards. What they may grant is fixed
 * by `server/materials/declaration.ts` — the page ids, the `view`/`edit`
 * composite actions and the two record-access choices.
 *
 * The relative imports here use the `.ts` extension because this module is
 * reached from a seed, and the seed loader imports seeds with the native ESM
 * loader. That loader resolves a relative specifier to the file it names, so a
 * `.js` specifier pointing at a `.ts` source would not load. The TypeScript
 * build rewrites these extensions back to `.js` on emit.
 */

/** Reads the non-confidential materials and asks the assistant about them. */
export const materialsColleagueSet = definePermissionSet('materials-colleague')
  .title({ key: 'permissionSets.colleague', ns: MATERIALS_NAMESPACE })
  .grant(materialsPageGrant('materials'))
  .grant(materialsPageGrant('assistant'))
  .grant(materialsColleagueViewGrant)
  .build();

/** Reads every material and maintains their content. */
export const materialsSupervisorSet = definePermissionSet(
  'materials-supervisor',
)
  .title({ key: 'permissionSets.supervisor', ns: MATERIALS_NAMESPACE })
  .grant(materialsPageGrant('materials'))
  .grant(materialsPageGrant('assistant'))
  .grant(materialsSupervisorViewGrant)
  .grant(materialsSupervisorEditGrant)
  .build();

export const materialsPermissionSets = [
  materialsColleagueSet,
  materialsSupervisorSet,
] as const;
