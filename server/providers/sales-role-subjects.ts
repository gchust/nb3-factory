import type { DatabaseManager } from '@nocobase/db';

/**
 * Structural view of the authorization middleware chain. The `Authorization`
 * class only exposes `use()` during plugin setup, so the sales provider
 * appends its role-subject middleware through this shape instead.
 */
export interface AuthorizationMiddlewareRequest {
  readonly http: unknown;
  principal?: { type: string; id: string };
  readonly subjects: {
    add(subject: { type: string; id: string }): void;
  };
}
export type AuthorizationMiddleware = (
  request: AuthorizationMiddlewareRequest,
  next: () => Promise<void>,
) => Promise<void>;
export interface AuthorizationWithMiddlewareChain {
  middlewares: AuthorizationMiddleware[];
}

/**
 * Builds the authorization middleware that expands a signed-in user's role
 * subjects. The authorization plugin's identity middleware only resolves the
 * `user` principal and the `authenticated:*` subject, so permission-set
 * grants assigned to `role:<key>` subjects never match — every page-level
 * access check (`/api/authz/permissions`) and any route using
 * `authorization.middleware()` would deny sales, sales-manager and visitor
 * users. This middleware reads the user's roles from the application's own
 * roles/userRoles tables and adds them as subjects, so the role-assigned
 * permission sets take effect for every request.
 *
 * Exported so tests can exercise the exact middleware the provider installs.
 */
export function createRoleSubjectMiddleware(
  database: DatabaseManager,
): AuthorizationMiddleware {
  return async (request, next) => {
    const principal = request.principal;
    if (principal?.type === 'user') {
      const roles = await database
        .query()
        .selectFrom('userRoles')
        .innerJoin('roles', 'roles.id', 'userRoles.roleId')
        .select('roles.key')
        .where('userRoles.userId', '=', principal.id)
        .execute();
      for (const row of roles) {
        request.subjects.add({ type: 'role', id: String(row.key) });
      }
    }
    await next();
  };
}
