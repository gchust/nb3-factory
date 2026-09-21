/**
 * What the viewer may do, derived from the membership the server reported.
 *
 * These are affordances, not enforcement. The server checks the same rules again on every request, and
 * it is the only place where a decision binds; the point of repeating them here is that a button a
 * person cannot use should not be offered in the first place.
 */
import type { LabAccess, LabRole } from './lab-types.js';

/** Roles that carry laboratory responsibility; `student` is not one. */
export const STAFF_ROLES: readonly LabRole[] = [
  'lab_admin',
  'teacher',
  'technician',
  'safety_officer',
];

export function roleIn(
  access: LabAccess | undefined,
  labId: number,
): LabRole | null {
  return (
    access?.memberships.find((membership) => membership.labId === labId)
      ?.role ?? null
  );
}

/** The viewer's role in this laboratory when it carries staff responsibility. */
export function staffRoleIn(
  access: LabAccess | undefined,
  labId: number,
): LabRole | null {
  const role = roleIn(access, labId);
  return role && role !== 'student' ? role : null;
}

export function canWriteIn(
  access: LabAccess | undefined,
  labId: number,
  roles: readonly LabRole[],
): boolean {
  if (!access) return false;
  if (access.isRoot) return true;
  const role = staffRoleIn(access, labId);
  return role !== null && roles.includes(role);
}

export function isStaffIn(
  access: LabAccess | undefined,
  labId: number,
): boolean {
  if (!access) return false;
  return access.isRoot || staffRoleIn(access, labId) !== null;
}

/** Whether the viewer holds one of these roles anywhere. */
export function hasStaffRole(
  access: LabAccess | undefined,
  roles: readonly LabRole[],
): boolean {
  if (!access) return false;
  if (access.isRoot) return true;
  return access.memberships.some(
    (membership) =>
      membership.role !== 'student' && roles.includes(membership.role),
  );
}

/** The status a work order transition leads to, mirroring the rule the service applies. */
export function transitionTarget(
  action: string,
  status: string,
): string | null {
  switch (action) {
    case 'assign':
      return status === 'open' ? 'assigned' : null;
    case 'start':
      return status === 'assigned' || status === 'open' ? 'in_progress' : null;
    case 'submit_review':
      return status === 'in_progress' ? 'pending_review' : null;
    case 'complete':
      return status === 'pending_review' ? 'completed' : null;
    case 'reject':
      return status === 'pending_review' ? 'in_progress' : null;
    case 'cancel':
      return ['open', 'assigned', 'in_progress', 'pending_review'].includes(
        status,
      )
        ? 'cancelled'
        : null;
    default:
      return null;
  }
}

const WORK_ORDER_ACTION_ROLES: Record<string, readonly LabRole[]> = {
  assign: ['lab_admin'],
  start: ['lab_admin', 'technician'],
  submit_review: ['lab_admin', 'technician'],
  complete: ['lab_admin'],
  reject: ['lab_admin'],
  cancel: ['lab_admin'],
};

/** Transitions the viewer may make on this work order from its current status. */
export function availableWorkOrderActions(
  access: LabAccess | undefined,
  labId: number,
  status: string,
): string[] {
  return Object.keys(WORK_ORDER_ACTION_ROLES).filter(
    (action) =>
      transitionTarget(action, status) !== null &&
      canWriteIn(access, labId, WORK_ORDER_ACTION_ROLES[action]),
  );
}
