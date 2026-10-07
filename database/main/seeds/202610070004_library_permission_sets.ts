import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

import {
  LIBRARY_PERMISSION_SETS,
  libraryMaintainer,
  libraryReader,
} from '../../seed-data/library-permission-sets.ts';
import {
  MAINTAINER_ACCOUNT,
  READER_ACCOUNT,
} from '../../../server/library/seed-data.ts';

/**
 * The two document-library permission sets and the account each is assigned to.
 *
 * Idempotent by key and by subject, so a re-run never duplicates a set and
 * never overwrites grants an administrator edited in the Authorization
 * settings. The titles are the localization descriptors the declarations
 * already carry; the stores persist them exactly as `encodeAuthorizationTitle`
 * writes them.
 */
const ASSIGNMENTS: readonly {
  readonly username: string;
  readonly permissionSetKey: string;
}[] = [
  {
    username: MAINTAINER_ACCOUNT.username,
    permissionSetKey: libraryMaintainer.key,
  },
  {
    username: READER_ACCOUNT.username,
    permissionSetKey: libraryReader.key,
  },
];

export default defineSeed({
  name: '202610070004_library_permission_sets',
  async run({ query }) {
    const now = new Date();

    for (const set of LIBRARY_PERMISSION_SETS) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) continue;

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

    for (const assignment of ASSIGNMENTS) {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', assignment.username)
        .executeTakeFirst();
      const userId = user ? String(user.id) : undefined;
      if (!userId) continue;

      const id = `user:${userId}:${assignment.permissionSetKey}`;
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('subjectId', '=', userId)
        .where('permissionSetKey', '=', assignment.permissionSetKey)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id,
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
