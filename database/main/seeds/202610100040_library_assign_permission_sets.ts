import { defineSeed } from '@nocobase/db';

interface AssignmentSeed {
  readonly username: string;
  readonly permissionSet: string;
}

const ASSIGNMENTS: readonly AssignmentSeed[] = [
  { username: 'librarian', permissionSet: 'library.editor' },
  { username: 'reader', permissionSet: 'library.reader' },
];

/**
 * Assigns the library Permission Sets to 资料员甲 and 阅读者乙, so the
 * administrator can later review and change each person's work permissions in
 * the backend. Idempotent on the assignment id.
 */
const seed = defineSeed({
  name: '202610100040_library_assign_permission_sets',
  async run({ query }) {
    for (const assignment of ASSIGNMENTS) {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', assignment.username)
        .executeTakeFirst();
      if (!user) {
        continue;
      }
      const userId = String(user.id);
      const id = `user:${userId}:${assignment.permissionSet}`;
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      const now = new Date();
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id,
          subjectType: 'user',
          subjectId: userId,
          permissionSetKey: assignment.permissionSet,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
