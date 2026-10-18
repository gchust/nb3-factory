import { defineSeed } from '@nocobase/db';

import {
  ensureLibraryUser,
  LIBRARY_USERS,
  type LibraryAccountRecord,
  type LibraryUserRecord,
} from '../../seed-data/library-users.ts';

/**
 * Creates the demonstration people and signs them in with the jobs they hold. The user rows and assignments are
 * ordinary data an administrator can edit; a rerun adds only what is missing.
 */
export default defineSeed({
  name: '202611010003_library_members',
  transaction: true,
  async run(context) {
    const users = context.repository<LibraryUserRecord>('user');
    const accounts = context.repository<LibraryAccountRecord>('account');

    for (const seed of LIBRARY_USERS) {
      await ensureLibraryUser(users, accounts, seed);
    }

    const now = new Date();
    for (const seed of LIBRARY_USERS) {
      const assignmentId = `user:${seed.id}:${seed.permissionSetKey}`;
      const existing = await context.query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (existing) continue;

      await context.query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId: seed.id,
          permissionSetKey: seed.permissionSetKey,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
