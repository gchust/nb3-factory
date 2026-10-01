import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

import { materialsPermissionSets } from '../../seed-data/materials-permission-sets.ts';

/**
 * Writes the two materials permission sets. Their grants come from
 * `database/seed-data/materials-permission-sets.ts`, which imports the same
 * declaration module the server registers at boot, so a stored grant can never
 * drift from the composite it names.
 */
export default defineSeed({
  name: '202609290003_materials_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const set of materialsPermissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
