import type { DatabaseConnection } from '@nocobase/db';

/**
 * The business roles of the IT service desk.
 *
 * `admin` is not stored on a profile: it is detected from the authorization plugin's
 * built-in root permission-set assignment. Everything else is an application-owned
 * profile row, so a signed-in user without one is treated as the least privileged role.
 */
export type HelpdeskRole = 'employee' | 'engineer' | 'serviceDesk' | 'admin';

export interface HelpdeskViewer {
  readonly userId: string;
  readonly name: string;
  readonly email?: string;
  readonly role: HelpdeskRole;
}

export interface HelpdeskProfileRow {
  readonly id: number;
  readonly userId: string;
  readonly role: string;
  readonly displayName: string | null;
}

export const assignableRoles: readonly Exclude<HelpdeskRole, 'admin'>[] = [
  'employee',
  'engineer',
  'serviceDesk',
];

/** Narrow a stored string to a business role, falling back to the least privileged one. */
export function normalizeRole(value: unknown): HelpdeskRole {
  return value === 'engineer' || value === 'serviceDesk' || value === 'admin'
    ? value
    : 'employee';
}

/**
 * Resolve the business role of a signed-in user. A profile row wins; without one the
 * built-in root permission-set assignment makes the user an administrator, and every
 * other account is an employee. This runs on the caller's connection, including inside a
 * transaction.
 */
export async function resolveHelpdeskRole(
  connection: DatabaseConnection,
  userId: string,
): Promise<HelpdeskRole> {
  const profile = await connection.query
    .selectFrom('helpdeskProfiles')
    .select('role')
    .where('userId', '=', userId)
    .executeTakeFirst<{ role: string }>();
  if (profile?.role) {
    return normalizeRole(profile.role);
  }

  const root = await connection.query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('permissionSetKey')
    .where('subjectType', '=', 'user')
    .where('subjectId', '=', userId)
    .where('permissionSetKey', '=', 'root')
    .executeTakeFirst<{ permissionSetKey: string }>();
  return root ? 'admin' : 'employee';
}

/** The roles that may see or act on every ticket, regardless of reporter or assignee. */
export function isHelpdeskOverseer(role: HelpdeskRole): boolean {
  return role === 'serviceDesk' || role === 'admin';
}
