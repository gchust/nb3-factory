/**
 * Domain rules for the project delivery suite.
 *
 * Everything here is pure: no database, no HTTP. Routes and the delivery
 * service share these so validation and status rules are defined once.
 */

export const DELIVERY_ADMIN_ROLE = 'system-administrator';
export const DELIVERY_MANAGER_ROLE = 'project-manager';
export const DELIVERY_MEMBER_ROLE = 'project-member';

export const PROJECT_STATUSES = [
  'planning',
  'active',
  'delivered',
  'paused',
] as const;
export const MILESTONE_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
] as const;
export const TASK_STATUSES = ['todo', 'in_progress', 'completed'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type DeliveryRole = 'administrator' | 'manager' | 'member';
export type TaskTimeliness = 'on_time' | 'overdue';

/** Error carrying a stable code the browser translates and an HTTP status. */
export class DeliveryRuleError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'DeliveryRuleError';
    this.code = code;
    this.status = status;
  }
}

export const DELIVERY_VALIDATION = 'DELIVERY_VALIDATION';
export const DELIVERY_NOT_FOUND = 'DELIVERY_NOT_FOUND';
export const DELIVERY_FORBIDDEN = 'DELIVERY_FORBIDDEN';
export const DELIVERY_DUPLICATE_TIMESHEET = 'DELIVERY_DUPLICATE_TIMESHEET';
export const DELIVERY_TASK_LOCKED = 'DELIVERY_TASK_LOCKED';
export const DELIVERY_TASK_HAS_TIMESHEETS = 'DELIVERY_TASK_HAS_TIMESHEETS';
export const DELIVERY_FILE_TOO_LARGE = 'DELIVERY_FILE_TOO_LARGE';
export const DELIVERY_FILE_REQUIRED = 'DELIVERY_FILE_REQUIRED';

export function validationError(message: string): DeliveryRuleError {
  return new DeliveryRuleError(DELIVERY_VALIDATION, message, 400);
}

export function notFoundError(message: string): DeliveryRuleError {
  return new DeliveryRuleError(DELIVERY_NOT_FOUND, message, 404);
}

export function forbiddenError(message: string): DeliveryRuleError {
  return new DeliveryRuleError(DELIVERY_FORBIDDEN, message, 403);
}

export function classifyDeliveryRole(keys: Iterable<string>): DeliveryRole {
  const roles = new Set(keys);
  if (roles.has(DELIVERY_ADMIN_ROLE)) return 'administrator';
  if (roles.has(DELIVERY_MANAGER_ROLE)) return 'manager';
  return 'member';
}

export function canManageDelivery(role: DeliveryRole): boolean {
  return role === 'administrator' || role === 'manager';
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return PROJECT_STATUSES.includes(value as ProjectStatus);
}

export function isMilestoneStatus(value: unknown): value is MilestoneStatus {
  return MILESTONE_STATUSES.includes(value as MilestoneStatus);
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus);
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return TASK_PRIORITIES.includes(value as TaskPriority);
}

export function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw validationError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function requireString(
  value: unknown,
  field: string,
  maxLength = 255,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validationError(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw validationError(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

export function optionalString(
  value: unknown,
  field: string,
  maxLength = 255,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw validationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) {
    throw validationError(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

export function parseIdentifier(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw validationError(`${field} must be a positive integer`);
  }
  return parsed;
}

export function requireIdentifier(value: unknown, field: string): number {
  const parsed = parseIdentifier(value, field);
  if (parsed === null) throw validationError(`${field} is required`);
  return parsed;
}

/** Accepts `YYYY-MM-DD` (UTC midnight) or any Date-parseable string. */
export function parseDate(value: unknown, field: string): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw validationError(`${field} is not a valid date`);
    }
    return value;
  }
  if (typeof value !== 'string') {
    throw validationError(`${field} must be a date string`);
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) {
    const date = new Date(
      Date.UTC(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
      ),
    );
    if (
      date.getUTCFullYear() !== Number(dateOnly[1]) ||
      date.getUTCMonth() !== Number(dateOnly[2]) - 1 ||
      date.getUTCDate() !== Number(dateOnly[3])
    ) {
      throw validationError(`${field} is not a valid date`);
    }
    return date;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError(`${field} is not a valid date`);
  }
  return parsed;
}

export function parseHours(value: unknown, field = 'hours'): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw validationError(`${field} must be greater than 0`);
  }
  if (parsed > 24) {
    throw validationError(`${field} must not exceed 24`);
  }
  const doubled = parsed * 2;
  if (Math.abs(doubled - Math.round(doubled)) > 1e-9) {
    throw validationError(`${field} must be a multiple of 0.5`);
  }
  return Math.round(doubled) / 2;
}

export function parseBudgetHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw validationError('budgetHours must be zero or greater');
  }
  return Math.round(parsed * 100) / 100;
}

export function startOfUtcDay(value: Date): number {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

export function coerceDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const trimmed = value.trim();
    // This database stores datetimes as text; a serialized epoch may arrive as
    // an integer or as a decimal string such as "1788220800000.0".
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const parsed = new Date(Number(trimmed));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const normalized = trimmed.includes('T')
      ? trimmed
      : `${trimmed.replace(' ', 'T')}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * A completed task is on time when its actual completion date is not later
 * than the planned date. An unfinished task is overdue once its planned date
 * has passed; a future unfinished task is neither.
 */
export function taskTimeliness(
  task: {
    status?: unknown;
    plannedDate?: unknown;
    actualDate?: unknown;
  },
  now: Date,
): TaskTimeliness | null {
  const planned = coerceDate(task.plannedDate);
  if (!planned) return null;
  const plannedDay = startOfUtcDay(planned);
  if (task.status === 'completed') {
    const actual = coerceDate(task.actualDate);
    if (!actual) {
      return plannedDay < startOfUtcDay(now) ? 'overdue' : 'on_time';
    }
    return startOfUtcDay(actual) > plannedDay ? 'overdue' : 'on_time';
  }
  return plannedDay < startOfUtcDay(now) ? 'overdue' : null;
}

export function isTaskOverdue(
  task: {
    status?: unknown;
    plannedDate?: unknown;
    actualDate?: unknown;
  },
  now: Date,
): boolean {
  return taskTimeliness(task, now) === 'overdue';
}

export function completionRate(completed: number, total: number): number {
  if (total <= 0) return 0;
  return completed / total;
}

/**
 * A completed task's status is final. Any request that would change it is
 * rejected; sending the same value and editing other fields is allowed.
 */
export function assertTaskStatusChangeAllowed(
  currentStatus: unknown,
  requestedStatus: unknown,
): void {
  if (currentStatus !== 'completed') return;
  if (requestedStatus === undefined || requestedStatus === 'completed') return;
  throw new DeliveryRuleError(
    DELIVERY_TASK_LOCKED,
    'A completed task status cannot be changed',
    409,
  );
}

/** A member may only change the status of their own task. */
export function assertMemberTaskUpdate(
  role: DeliveryRole,
  actorId: string,
  task: { assigneeId?: unknown },
  fields: readonly string[],
): void {
  if (role !== 'member') return;
  const disallowed = fields.filter((field) => field !== 'status');
  if (disallowed.length > 0) {
    throw forbiddenError(
      'A project member may only update their own task status',
    );
  }
  if (typeof task.assigneeId !== 'string' || task.assigneeId !== actorId) {
    throw forbiddenError('A project member may only update their own tasks');
  }
}
