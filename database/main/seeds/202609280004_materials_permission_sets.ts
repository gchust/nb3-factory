import { defineSeed } from '@nocobase/db';

/**
 * Role markers for the materials feature, and the assignment of each seeded
 * account to one of them:
 *
 * - `materials-manager` — may see the manager-only material and edit materials.
 * - `materials-colleague` — the regular colleague role; sees the two public
 *   materials.
 *
 * Like the built-in `member` set they carry no grants. The materials service
 * reads them as role markers and enforces the actual visibility rule itself,
 * the same way `root` is an unrestricted bypass declared in code rather than a
 * grant list. They also surface in the Users page role picker through the
 * Users plugin's application role scope, so an administrator can move an
 * account between the two roles without a code change.
 *
 * Written as raw rows exactly like the authorization plugin's own root-set
 * seed, and idempotent by key and assignment id.
 */
const seed = defineSeed({
  name: '202609280004_materials_permission_sets',
  async run({ query }) {
    const now = new Date();
    const sets = [
      {
        key: 'materials-manager',
        title: {
          key: 'permissionSets.materials.manager',
          ns: 'nb3-factory',
        },
      },
      {
        key: 'materials-colleague',
        title: {
          key: 'permissionSets.materials.colleague',
          ns: 'nb3-factory',
        },
      },
    ] as const;

    for (const set of sets) {
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
          id: crypto.randomUUID(),
          key: set.key,
          title: JSON.stringify(set.title),
          grants: JSON.stringify([]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assignments = [
      { username: 'materials.manager', permissionSetKey: 'materials-manager' },
      {
        username: 'materials.colleague',
        permissionSetKey: 'materials-colleague',
      },
    ] as const;

    for (const assignment of assignments) {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', assignment.username)
        .limit(1)
        .executeTakeFirst();

      if (!user) {
        continue;
      }

      const subjectId = String(user.id);
      const assignmentId = `user:${subjectId}:${assignment.permissionSetKey}`;
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
          permissionSetKey: assignment.permissionSetKey,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
