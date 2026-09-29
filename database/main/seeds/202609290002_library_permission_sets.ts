import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { librarian, reader } from '../../seed-data/permission-sets.ts';

/**
 * Persists the library's initial job permission sets and assigns them to the demonstration accounts.
 *
 * A permission set is declared as a value in `database/seed-data/permission-sets.ts`; this seed is what turns it into
 * administrator-editable configuration. An existing set is left alone so later edits made through the authorization
 * workspace survive reinstalling, and an existing assignment is not re-added after an administrator removes it.
 */
const ASSIGNMENTS = [
  { username: 'jia', permissionSet: librarian },
  { username: 'yier', permissionSet: reader },
] as const;

export default defineSeed({
  name: '202609290002_library_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();

    for (const permissionSet of [librarian, reader]) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) continue;
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

    for (const assignment of ASSIGNMENTS) {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', assignment.username)
        .executeTakeFirst();
      if (!user) continue;

      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('permissionSetKey', '=', assignment.permissionSet.key)
        .where('subjectType', '=', 'user')
        .where('subjectId', '=', String(user.id))
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: crypto.randomUUID(),
          permissionSetKey: assignment.permissionSet.key,
          subjectType: 'user',
          subjectId: String(user.id),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
