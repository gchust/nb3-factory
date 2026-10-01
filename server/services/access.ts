import type { DatabaseManager } from '@nocobase/db';

// The initial job permission sets the service desk ships with. They are ordinary
// authorization permission sets: an administrator can rename, re-grant or assign
// them from Settings > Permission Sets. This module only reads the assignment
// table, so a reassignment takes effect on the next request with no code change.
export const SERVICE_ROLE = {
  supervisor: 'service-supervisor',
  engineer: 'service-engineer',
  observer: 'service-observer',
  integrator: 'service-integrator',
} as const;

export type ServiceRole = (typeof SERVICE_ROLE)[keyof typeof SERVICE_ROLE];

export interface Principal {
  readonly id: string;
  readonly type: 'user' | 'api-key';
  readonly displayName: string;
}

export interface ServiceAccess {
  readonly principal: Principal;
  readonly roles: ReadonlySet<string>;
  is(...roles: readonly string[]): boolean;
  isAdmin(): boolean;
  isEngineer(): boolean;
  isObserver(): boolean;
  isIntegrator(): boolean;
}

export function createServiceAccess(
  principal: Principal,
  roles: ReadonlySet<string>,
): ServiceAccess {
  return {
    principal,
    roles,
    is: (...requested) => requested.some((role) => roles.has(role)),
    isAdmin: () => roles.has(SERVICE_ROLE.supervisor) || roles.has('root'),
    isEngineer: () => roles.has(SERVICE_ROLE.engineer),
    isObserver: () => roles.has(SERVICE_ROLE.observer),
    isIntegrator: () => roles.has(SERVICE_ROLE.integrator),
  };
}

interface AssignmentRow {
  subjectType: string;
  subjectId: string;
  permissionSetKey: string;
}

/**
 * Resolves the permission sets that apply to a signed-in user: the ones
 * assigned to the user directly plus the ones assigned to the `authenticated`
 * subject, which reaches every signed-in account.
 */
export async function resolveRoles(
  database: DatabaseManager,
  userId: string,
): Promise<ReadonlySet<string>> {
  const repository = database.repository<AssignmentRow>(
    'authorizationPermissionSetAssignments',
  );
  const assignments = await repository.findMany({
    filter: (filter) =>
      filter.or([
        filter.and([
          filter.string('subjectType').eq('user'),
          filter.string('subjectId').eq(userId),
        ]),
        filter.and([
          filter.string('subjectType').eq('authenticated'),
          filter.string('subjectId').eq('*'),
        ]),
      ]),
    limit: 100,
  });
  return new Set(assignments.map((row) => row.permissionSetKey));
}
