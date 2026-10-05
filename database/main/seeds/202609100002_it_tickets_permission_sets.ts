import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';
import { itTicketsPermissionSets } from '../../seed-data/it-tickets-permission-sets.ts';

/**
 * Installs the two repair-request jobs on a fresh database.
 *
 * The sets are initial configuration, not sample data: without them the page
 * and its endpoints exist but nobody can reach them. An administrator edits
 * them afterwards from the authorization settings, so an existing row is left
 * exactly as it is.
 */
const seed = defineSeed({
  name: '202609100002_it_tickets_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const permissionSet of itTicketsPermissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
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
