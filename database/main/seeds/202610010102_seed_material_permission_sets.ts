import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { materialPermissionSets } from '../../seed-data/permission-sets.ts';

/**
 * The two initial jobs: a supervisor who keeps and edits every material, and a
 * colleague who reads only the public ones. This is one-time installation data;
 * an administrator may rename, re-scope or re-assign them afterwards, and a
 * rerun must not overwrite that.
 */
const seed = defineSeed({
  name: '202610010102_seed_material_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const permissionSet of materialPermissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: permissionSet.key,
          key: permissionSet.key,
          title: encodeAuthorizationTitle(permissionSet.title),
          grants: JSON.stringify(permissionSet.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
