import type { AppAuthorization } from '@nocobase/app-plugin-authorization';

export const SALES_MANAGER_ROLE = 'sales-manager';
export const SYSTEM_ADMINISTRATOR_ROLE = 'system-administrator';

export interface CrmRoles {
  readonly admin: boolean;
  readonly manager: boolean;
  /** Sales representative: the authenticated default role. */
  readonly representative: boolean;
}

/**
 * Reads the caller's direct roles. Role storage and assignment stay with the
 * Authorization plugin; this only decides which UI affordances and
 * manager-only operations are available.
 */
export async function resolveCrmRoles(
  authorization: AppAuthorization,
  userId: string,
): Promise<CrmRoles> {
  const assignments = await authorization.permissionSets.listAssignments();
  const direct = new Set(
    assignments
      .filter(
        (assignment) =>
          assignment.subject.type === 'user' &&
          assignment.subject.id === userId,
      )
      .map((assignment) => assignment.permissionSet),
  );
  const admin = direct.has(SYSTEM_ADMINISTRATOR_ROLE);
  const manager = direct.has(SALES_MANAGER_ROLE);
  return { admin, manager, representative: !admin && !manager };
}

export function canManage(roles: CrmRoles): boolean {
  return roles.admin || roles.manager;
}
