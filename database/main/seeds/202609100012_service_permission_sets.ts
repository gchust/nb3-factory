import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { servicePermissionSets } from '../../seed-data/permission-sets.ts';

/**
 * Writes the initial permission sets. The values are only installation data:
 * an administrator edits them afterwards, so an existing key is left alone
 * rather than overwritten.
 */
const seed = defineSeed({
  name: '202609100012_service_permission_sets',
  async run({ query }) {
    const now = new Date();
    for (const set of servicePermissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) continue;
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

export default seed;
