import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

import {
  IT_DEMO_USERS,
  itEmployeePermissionSet,
  itHandlerPermissionSet,
} from '../../seed-data/it-tickets.ts';

import { defineSeed } from '@nocobase/db';

/**
 * Persists the two job permission sets and assigns them to the known
 * demonstration accounts. An existing set is never overwritten, so an
 * administrator's later edits survive; a missing assignment is added, and an
 * assignment an administrator removed is not re-added once this seed has run.
 */
export default defineSeed({
  name: '202609300003_it_tickets_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();

    for (const permissionSet of [
      itEmployeePermissionSet,
      itHandlerPermissionSet,
    ]) {
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

    for (const user of IT_DEMO_USERS) {
      const row = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
        .executeTakeFirst();
      if (!row) {
        continue;
      }
      const userId = String(row.id);
      const assignmentId = `user:${userId}:${user.permissionSetKey}`;
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId: userId,
          permissionSetKey: user.permissionSetKey,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
