import { defineSeed } from '@nocobase/db';

import { itRepairPermissionSets } from '../../seed-data/repair-permission-sets.ts';

/**
 * Creates the IT repair Permission Sets. Idempotent: an existing set keeps its
 * grants so an administrator's edits are never overwritten on a later run.
 */
const seed = defineSeed({
  name: '202609300002_it_repair_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const permissionSet of itRepairPermissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: permissionSet.key,
          title: JSON.stringify(permissionSet.title),
          grants: JSON.stringify(permissionSet.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
