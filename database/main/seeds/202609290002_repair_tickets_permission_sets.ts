import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import {
  employeePermissionSet,
  handlerPermissionSet,
} from '../../seed-data/repair-permission-sets.ts';

/**
 * Writes the initial repair-ticket permission sets on a fresh installation.
 *
 * Only creates a set that is absent: an administrator's later edits to the
 * grants, the title or the assignments are configuration, and re-running this
 * seed must not undo them.
 */
export default defineSeed({
  name: '202609290002_repair_tickets_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const permissionSet of [employeePermissionSet, handlerPermissionSet]) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
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
