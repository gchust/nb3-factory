import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';

/**
 * The application's service-desk roles, expressed as authorization Permission
 * Sets.
 *
 * A Permission Set is the unit the Users page assigns as a role (the users
 * plugin exposes every unprotected set through the `app` role scope), and the
 * unit the ticket service reads back to decide what a caller may see and do.
 * The sets carry no grants on purpose: the ticket service is the single place
 * that enforces the state machine and the record scope, and it does so
 * explicitly, so a set here is a role marker rather than a second, partly
 * overlapping permission system.
 */
export const EMPLOYEE_PERMISSION_SET = 'itsm-employee';
export const ENGINEER_PERMISSION_SET = 'itsm-engineer';
export const SERVICE_DESK_PERMISSION_SET = 'itsm-service-desk';

/** The three roles, from widest to narrowest. */
export const ITSM_PERMISSION_SET_TITLES: Readonly<Record<string, string>> = {
  [EMPLOYEE_PERMISSION_SET]: 'Service desk employee',
  [ENGINEER_PERMISSION_SET]: 'Service desk engineer',
  [SERVICE_DESK_PERMISSION_SET]: 'Service desk dispatcher',
};

/**
 * Creates the role Permission Sets if they are missing. Runs on every boot, so
 * it never overwrites a title an administrator changed, and never fails when a
 * set already exists.
 */
export async function ensureItsmPermissionSets(
  authz: AppAuthorization,
): Promise<void> {
  for (const [key, title] of Object.entries(ITSM_PERMISSION_SET_TITLES)) {
    const existing = await authz.permissionSets.get(key);
    if (existing) continue;
    await authz.permissionSets.create({ key, title, grants: [] });
  }
}
