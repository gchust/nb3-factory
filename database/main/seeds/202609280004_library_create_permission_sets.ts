import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

import {
  managerPermissionSet,
  readerPermissionSet,
} from '../seed-data/library-permission-sets.ts';

/**
 * Persists the library's initial Permission Sets and assigns them to the two
 * sample accounts. An existing set is left alone, so an administrator's later
 * edits survive a re-run; an existing assignment is left alone too.
 */
const seed = defineSeed({
  name: '202609280004_library_create_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const set of [managerPermissionSet, readerPermissionSet]) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (!existing) {
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
    }

    for (const [username, permissionSet] of [
      ['manager.a', managerPermissionSet.key],
      ['reader.b', readerPermissionSet.key],
    ] as const) {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .executeTakeFirst();
      if (!user) {
        continue;
      }
      const subjectId = String(user.id);
      const assignmentId = `user:${subjectId}:${permissionSet}`;
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
          subjectId,
          permissionSetKey: permissionSet,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
