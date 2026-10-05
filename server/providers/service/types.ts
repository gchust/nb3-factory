/** The engineering roles this application distinguishes. */
export type ServiceRole = 'manager' | 'engineer' | 'observer' | 'integrator';

export const WORK_ORDER_STATUSES = [
  'pending_acceptance',
  'pending_processing',
  'processing',
  'pending_confirmation',
  'closed',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_PRIORITIES = ['normal', 'urgent'] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

export const INSPECTION_STATUSES = [
  'pending',
  'in_progress',
  'done',
  'overdue',
] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export type AttachmentCategory = 'photo' | 'report';

/** The authenticated caller, reduced to what the domain needs. */
export interface ServiceActor {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly roles: readonly ServiceRole[];
  /** The engineer seat linked to the account, when there is one. */
  readonly memberId: number | null;
  readonly memberGroupId: number | null;
}

export function firstRole(roles: readonly ServiceRole[]): ServiceRole {
  if (roles.includes('manager')) return 'manager';
  if (roles.includes('engineer')) return 'engineer';
  if (roles.includes('observer')) return 'observer';
  return 'integrator';
}

/**
 * A numeric column, or `null` when the value is absent or not a number.
 *
 * Unknown is deliberately distinct from zero: a missing `id` or `customerId`
 * must never be treated as the record numbered zero.
 */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  return '';
}

export function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export function isoDate(value: unknown): string | null {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

/**
 * A foreign id from request input: either a number or a `{ id }` object.
 * Returns `null` when no id can be read.
 */
export function recordId(value: unknown): number | null {
  if (value !== null && typeof value === 'object' && 'id' in value) {
    return num(value.id);
  }
  return num(value);
}
