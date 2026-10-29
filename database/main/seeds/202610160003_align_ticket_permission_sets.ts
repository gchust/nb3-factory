import { defineSeed } from '@nocobase/db';

import { admin, maintainer, requester } from './seed-data/permission-sets.ts';

const permissionSets = [admin, maintainer, requester];

/**
 * Brings permission sets created by the first ticket seed in line with the repaired workflow: engineers are limited
 * to assigned tickets, the service desk gains Assign, and only requesters can close or reopen.
 *
 * `revision` starts as `initial`. Once an administrator edits a set through Roles and permissions it becomes a random
 * revision, and this seed leaves that set alone. This upgrades untouched installations without overwriting deliberate
 * local permission changes.
 */
const seed = defineSeed({
  name: '202610160003_align_ticket_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const permissionSet of permissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select(['revision'])
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (!existing || existing.revision !== 'initial') continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({
          grants: JSON.stringify(permissionSet.grants),
          revision: '202610160003',
          updatedAt: now,
        })
        .where('key', '=', permissionSet.key)
        .where('revision', '=', 'initial')
        .execute();
    }
  },
});

export default seed;
