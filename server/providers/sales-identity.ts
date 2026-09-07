import type { AuthorizationScope } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';

type AuthorizationIdentity = AuthorizationScope['identity'];

/**
 * Resolves the verified identity for a signed-in request: the user principal
 * plus the role subjects read from the application's own roles/userRoles
 * tables. Role subjects are trusted because they come from the database, not
 * from request input.
 */
export async function resolveSalesIdentity(
  database: DatabaseManager,
  userId: string,
): Promise<AuthorizationIdentity> {
  const roles = await database
    .query()
    .selectFrom('userRoles')
    .innerJoin('roles', 'roles.id', 'userRoles.roleId')
    .select('roles.key')
    .where('userRoles.userId', '=', userId)
    .execute();
  return {
    principal: { type: 'user', id: userId },
    subjects: [
      { type: 'authenticated', id: '*' },
      ...roles.map((row) => ({ type: 'role', id: String(row.key) })),
    ],
  };
}
