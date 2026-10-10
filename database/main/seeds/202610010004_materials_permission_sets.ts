import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

import {
  materialsColleagueSet,
  materialsSupervisorSet,
} from '../../seed-data/materials-permission-sets.ts';

/**
 * Installs the two job permission sets and assigns each test account its job.
 *
 * The sets are persisted configuration, not code-owned state: an administrator
 * may edit their grants afterwards, and this seed preserves an existing set and
 * an existing assignment instead of overwriting either.
 */
const ASSIGNMENTS = [
  { username: 'supervisor', permissionSet: materialsSupervisorSet },
  { username: 'colleague', permissionSet: materialsColleagueSet },
] as const;

const seed = defineSeed({
  name: '202610010004_materials_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();

    for (const permissionSet of [
      materialsColleagueSet,
      materialsSupervisorSet,
    ]) {
      const existingSet = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', permissionSet.key)
        .limit(1)
        .executeTakeFirst();
      if (existingSet) {
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

    for (const { username, permissionSet } of ASSIGNMENTS) {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .limit(1)
        .executeTakeFirst();
      if (!user) {
        continue;
      }
      const subjectId = String(user.id);
      const assignmentId = `user:${subjectId}:${permissionSet.key}`;
      const existingAssignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .limit(1)
        .executeTakeFirst();
      if (existingAssignment) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId,
          permissionSetKey: permissionSet.key,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
