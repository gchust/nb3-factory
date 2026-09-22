import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { buildServicePermissionSets } from '../../../server/service-authorization.ts';

/**
 * Installs the business Permission Sets that model the after-sales service roles.
 *
 * The built-in `root` and `member` sets are created by the authorization and
 * authentication plugin seeds, so this seed only adds the service-owned sets.
 * Every set is inserted by unique key; a rerun leaves an administrator's edits
 * to an existing set untouched.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609220201_seed_service_permission_sets',

  async run({ query }) {
    const now = new Date();
    for (const definition of buildServicePermissionSets()) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', definition.key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: definition.key,
          title: JSON.stringify(definition.title),
          grants: JSON.stringify(definition.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
