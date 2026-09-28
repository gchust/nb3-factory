import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

import {
  MAINTAINER_USERNAME,
  READER_USERNAME,
} from '../../seed-data/accounts.ts';
import {
  MAINTAINER_SET_KEY,
  maintainerPermissionSet,
  READER_SET_KEY,
  readerPermissionSet,
} from '../../seed-data/permission-sets.ts';

/**
 * Persists the two library roles and gives them to the two demonstration
 * accounts.
 *
 * The sets are the initial configuration, not code-owned defaults: an
 * administrator edits or reassigns them afterwards and this seed does not
 * revisit that. It only creates what is missing, so rerunning it after an
 * administrator deleted an assignment does not put the assignment back.
 */
export default defineSeed({
  name: '202609280003_library_seed_permissions',
  transaction: true,
  async run({ query }) {
    const now = new Date();

    for (const set of [maintainerPermissionSet, readerPermissionSet]) {
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
          id: set.key,
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assignments = [
      { username: MAINTAINER_USERNAME, permissionSetKey: MAINTAINER_SET_KEY },
      { username: READER_USERNAME, permissionSetKey: READER_SET_KEY },
    ] as const;

    for (const assignment of assignments) {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', assignment.username)
        .executeTakeFirst();
      if (!user) {
        continue;
      }
      const userId = String(user.id);
      const assignmentId = `user:${userId}:${assignment.permissionSetKey}`;
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
          permissionSetKey: assignment.permissionSetKey,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
