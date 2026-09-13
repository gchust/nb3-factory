import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const SYSTEM_ADMINISTRATOR = 'system-administrator';
export const HR_ROLE = 'hr';
export const DEPARTMENT_MANAGER_ROLE = 'department-manager';
export const EMPLOYEE_ROLE = 'employee';

export interface HrEmployeeRecord {
  id: number;
  name: string;
  employeeNo: string;
  departmentId: number | null;
  position: string | null;
  hireDate: string | null;
  status: string;
  annualLeaveDays: number;
  userId: string | null;
}

export interface HrDepartmentRecord {
  id: number;
  name: string;
  managerId: number | null;
  managerName: string | null;
}

export interface HrActor {
  userId: string;
  name: string;
  isAdmin: boolean;
  isHr: boolean;
  isManager: boolean;
  isEmployee: boolean;
  employee: HrEmployeeRecord | null;
  managedDepartmentIds: number[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class HrError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly details: Record<string, unknown>;

  public constructor(
    code: string,
    httpStatus: number,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'HrError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export const forbidden = (): HrError =>
  new HrError(
    'HR_FORBIDDEN',
    403,
    'You are not allowed to perform this action.',
  );
export const notFound = (what: string): HrError =>
  new HrError('HR_NOT_FOUND', 404, `The requested ${what} does not exist.`);
export const invalidInput = (
  message: string,
  details: Record<string, unknown> = {},
): HrError => new HrError('HR_INVALID_INPUT', 400, message, details);

// ---------------------------------------------------------------------------
// Pure rules (exported so they can be tested without a database)
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Natural calendar days, inclusive of both endpoints. */
export function computeLeaveDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw invalidInput('Invalid leave dates.');
  }
  return Math.round((end - start) / 86_400_000) + 1;
}

export type LeaveType = 'annual' | 'sick' | 'personal';
export const LEAVE_TYPES: readonly LeaveType[] = ['annual', 'sick', 'personal'];
export const OVERTIME_MAX_HOURS = 24;

export interface LeaveRuleInput {
  type: LeaveType;
  startDate: string;
  endDate: string;
  annualLeaveDays: number;
  usedAnnualLeaveDays: number;
}

export interface LeaveRuleResult {
  days: number;
  remainingAnnualLeaveDays: number;
}

/**
 * Validates a leave request and computes its natural-day length. Throws an
 * `HrError` with a stable code so the caller can surface a precise message.
 */
export function evaluateLeaveRequest(input: LeaveRuleInput): LeaveRuleResult {
  if (!LEAVE_TYPES.includes(input.type)) {
    throw invalidInput('Unknown leave type.', { field: 'type' });
  }
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate)) {
    throw invalidInput('Leave dates must use the YYYY-MM-DD format.');
  }
  if (input.startDate > input.endDate) {
    throw new HrError(
      'HR_INVALID_DATE_RANGE',
      400,
      'The start date must not be later than the end date.',
    );
  }

  const days = computeLeaveDays(input.startDate, input.endDate);
  const remainingAnnualLeaveDays =
    input.annualLeaveDays - input.usedAnnualLeaveDays;

  if (input.type === 'annual' && days > remainingAnnualLeaveDays) {
    throw new HrError(
      'HR_ANNUAL_LEAVE_EXCEEDED',
      400,
      'The requested annual leave exceeds the remaining balance.',
      { days, remainingAnnualLeaveDays: Math.max(0, remainingAnnualLeaveDays) },
    );
  }

  return { days, remainingAnnualLeaveDays };
}

export function parseHours(value: unknown): number {
  const hours = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw invalidInput('Overtime hours must be a positive number.', {
      field: 'hours',
    });
  }
  if (hours > OVERTIME_MAX_HOURS) {
    throw invalidInput('Overtime hours cannot exceed 24 in a day.', {
      field: 'hours',
    });
  }
  return Math.round(hours * 100) / 100;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const LEAVE_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type RequestStatus = (typeof LEAVE_STATUSES)[number];
const EMPLOYEE_STATUSES = ['active', 'inactive'] as const;

export interface HrService {
  resolveActor(
    userId: string,
    name: string,
    options?: { provision?: boolean },
  ): Promise<HrActor>;
  listDepartments(): Promise<HrDepartmentCreateRecord[]>;
  createDepartment(input: DepartmentInput, actor: HrActor): Promise<Row>;
  updateDepartment(
    id: number,
    input: Partial<DepartmentInput>,
    actor: HrActor,
  ): Promise<Row>;
  listEmployees(
    filter: { departmentId?: number },
    actor: HrActor,
  ): Promise<Row[]>;
  createEmployee(input: EmployeeInput, actor: HrActor): Promise<Row>;
  updateEmployee(
    id: number,
    input: Partial<EmployeeInput>,
    actor: HrActor,
  ): Promise<Row>;
  listLeaveRequests(
    filter: { status?: string; employeeId?: number },
    actor: HrActor,
  ): Promise<Row[]>;
  createLeaveRequest(input: LeaveInput, actor: HrActor): Promise<Row>;
  updateLeaveRequest(
    id: number,
    input: Partial<LeaveInput>,
    actor: HrActor,
  ): Promise<Row>;
  decideLeaveRequest(
    id: number,
    decision: DecisionInput,
    actor: HrActor,
  ): Promise<Row>;
  listOvertimeRequests(
    filter: { status?: string; employeeId?: number },
    actor: HrActor,
  ): Promise<Row[]>;
  createOvertimeRequest(input: OvertimeInput, actor: HrActor): Promise<Row>;
  decideOvertimeRequest(
    id: number,
    decision: DecisionInput,
    actor: HrActor,
  ): Promise<Row>;
  statistics(actor: HrActor): Promise<StatisticsResult>;
  canAccessAttachment(attachmentId: string, actor: HrActor): Promise<boolean>;
}

export interface DepartmentInput {
  name?: string;
  managerId?: number | null;
}
export interface EmployeeInput {
  name?: string;
  employeeNo?: string;
  departmentId?: number | null;
  position?: string | null;
  hireDate?: string | null;
  status?: string;
  annualLeaveDays?: number;
}
export interface LeaveInput {
  employeeId?: number;
  type?: string;
  startDate?: string;
  endDate?: string;
  reason?: string | null;
  attachmentId?: string | null;
  attachmentName?: string | null;
}
export interface OvertimeInput {
  employeeId?: number;
  overtimeDate?: string;
  hours?: number | string;
  reason?: string | null;
}
export interface DecisionInput {
  status?: string;
  comment?: string | null;
}

export interface StatisticsResult {
  month: string;
  departments: readonly {
    departmentId: number | null;
    departmentName: string;
    leaveDays: number;
    overtimeHours: number;
  }[];
  employees: readonly {
    employeeId: number;
    employeeName: string;
    employeeNo: string;
    departmentName: string;
    annualLeaveDays: number;
    usedAnnualLeaveDays: number;
    remainingAnnualLeaveDays: number;
  }[];
  overtimeHoursThisMonth: number;
}

export interface HrDepartmentCreateRecord {
  id: number;
  name: string;
  managerId: number | null;
  managerName: string | null;
}

export const hrServiceToken: ServiceToken<HrService> =
  createServiceToken<HrService>('app/hr-service');

export default class HrProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/hr-provider';

  public override register(): void {
    this.app.container.singleton(hrServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createHrService(database);
    });
  }
}

export function createHrService(database: DatabaseManager): HrService {
  const service = new DatabaseHrService(database);
  return {
    resolveActor: (userId, name, options) =>
      service.resolveActor(userId, name, options),
    listDepartments: () => service.listDepartments(),
    createDepartment: (input, actor) => service.createDepartment(input, actor),
    updateDepartment: (id, input, actor) =>
      service.updateDepartment(id, input, actor),
    listEmployees: (filter, actor) => service.listEmployees(filter, actor),
    createEmployee: (input, actor) => service.createEmployee(input, actor),
    updateEmployee: (id, input, actor) =>
      service.updateEmployee(id, input, actor),
    listLeaveRequests: (filter, actor) =>
      service.listLeaveRequests(filter, actor),
    createLeaveRequest: (input, actor) =>
      service.createLeaveRequest(input, actor),
    updateLeaveRequest: (id, input, actor) =>
      service.updateLeaveRequest(id, input, actor),
    decideLeaveRequest: (id, decision, actor) =>
      service.decideLeaveRequest(id, decision, actor),
    listOvertimeRequests: (filter, actor) =>
      service.listOvertimeRequests(filter, actor),
    createOvertimeRequest: (input, actor) =>
      service.createOvertimeRequest(input, actor),
    decideOvertimeRequest: (id, decision, actor) =>
      service.decideOvertimeRequest(id, decision, actor),
    statistics: (actor) => service.statistics(actor),
    canAccessAttachment: (attachmentId, actor) =>
      service.canAccessAttachment(attachmentId, actor),
  };
}

const DEFAULT_SELF_SERVICE_ANNUAL_LEAVE_DAYS = 10;

class DatabaseHrService {
  public constructor(private readonly database: DatabaseManager) {}

  // -- actor/roles ---------------------------------------------------------

  public async resolveActor(
    userId: string,
    name: string,
    options: { provision?: boolean } = {},
  ): Promise<HrActor> {
    const keys = await this.roleKeysFor(userId);
    const isAdmin = keys.has(SYSTEM_ADMINISTRATOR);
    const isHr = keys.has(HR_ROLE);
    const isManager = keys.has(DEPARTMENT_MANAGER_ROLE);
    let employee = await this.findEmployeeByUser(userId);
    const shouldProvision =
      options.provision === true && !isAdmin && !isHr && !isManager;
    if (!employee && shouldProvision) {
      employee = await this.provisionEmployee(userId, name);
    }
    const managedDepartmentIds = employee
      ? await this.managedDepartmentIds(employee)
      : [];
    return {
      userId,
      name,
      isAdmin,
      isHr,
      isManager,
      isEmployee: true,
      employee,
      managedDepartmentIds,
    };
  }

  private async roleKeysFor(userId: string): Promise<Set<string>> {
    const query = this.database.query();
    let rows: Row[];
    try {
      rows = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select(['subjectType', 'subjectId', 'permissionSetKey'])
        .execute();
    } catch {
      return new Set();
    }
    const keys = new Set<string>();
    for (const row of rows) {
      const subjectType = String(row.subjectType);
      const subjectId = String(row.subjectId);
      const key = String(row.permissionSetKey);
      if (
        (subjectType === 'user' && subjectId === userId) ||
        (subjectType === 'authenticated' && subjectId === '*')
      ) {
        keys.add(key);
      }
    }
    return keys;
  }

  private async findEmployeeByUser(
    userId: string,
  ): Promise<HrEmployeeRecord | null> {
    const row = await this.database
      .query()
      .selectFrom('hrEmployees')
      .selectAll()
      .where('userId', '=', userId)
      .executeTakeFirst();
    return row ? toEmployee(row) : null;
  }

  private async provisionEmployee(
    userId: string,
    name: string,
  ): Promise<HrEmployeeRecord> {
    const now = new Date();
    const employeeNo = `EMP-${userId}`.slice(0, 64);
    await this.database
      .query()
      .insertInto('hrEmployees')
      .values({
        name: name?.trim() || employeeNo,
        employeeNo,
        departmentId: null,
        position: null,
        hireDate: null,
        status: 'active',
        annualLeaveDays: DEFAULT_SELF_SERVICE_ANNUAL_LEAVE_DAYS,
        userId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const created = await this.findEmployeeByUser(userId);
    if (!created) {
      throw new HrError(
        'HR_EMPLOYEE_PROVISION_FAILED',
        500,
        'Could not create an employee profile for the account.',
      );
    }
    return created;
  }

  private async managedDepartmentIds(
    employee: HrEmployeeRecord,
  ): Promise<number[]> {
    const rows = await this.database
      .query()
      .selectFrom('hrDepartments')
      .select(['id', 'managerId'])
      .execute();
    const ids = new Set<number>();
    for (const row of rows) {
      const managerId = toNullableNumber(row.managerId);
      if (managerId !== null && managerId === employee.id)
        ids.add(Number(row.id));
    }
    if (employee.departmentId !== null) ids.add(employee.departmentId);
    return [...ids];
  }

  // -- departments ---------------------------------------------------------

  public async listDepartments(): Promise<HrDepartmentCreateRecord[]> {
    const rows = await this.database
      .query()
      .selectFrom('hrDepartments')
      .selectAll()
      .orderBy('name', 'asc')
      .execute();
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      managerId: toNullableNumber(row.managerId),
      managerName: stringValue(row.managerName),
    }));
  }

  public async createDepartment(
    input: DepartmentInput,
    actor: HrActor,
  ): Promise<Row> {
    requireHrOrAdmin(actor);
    const name = requiredString(input.name, 'name');
    const existing = await this.database
      .query()
      .selectFrom('hrDepartments')
      .select('id')
      .where('name', '=', name)
      .executeTakeFirst();
    if (existing) {
      throw new HrError(
        'HR_DEPARTMENT_NAME_EXISTS',
        409,
        'A department with this name already exists.',
      );
    }
    const manager = await this.optionalEmployee(input.managerId);
    const now = new Date();
    await this.database
      .query()
      .insertInto('hrDepartments')
      .values({
        name,
        managerId: manager?.id ?? null,
        managerName: manager?.name ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const created = await this.database
      .query()
      .selectFrom('hrDepartments')
      .selectAll()
      .where('name', '=', name)
      .executeTakeFirstOrThrow();
    return created;
  }

  public async updateDepartment(
    id: number,
    input: Partial<DepartmentInput>,
    actor: HrActor,
  ): Promise<Row> {
    requireHrOrAdmin(actor);
    const current = await this.requireDepartment(id);
    const updates: Row = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = requiredString(input.name, 'name');
      const duplicate = await this.database
        .query()
        .selectFrom('hrDepartments')
        .select('id')
        .where('name', '=', name)
        .where('id', '!=', id)
        .executeTakeFirst();
      if (duplicate) {
        throw new HrError(
          'HR_DEPARTMENT_NAME_EXISTS',
          409,
          'A department with this name already exists.',
        );
      }
      updates.name = name;
    }
    if (input.managerId !== undefined) {
      const manager = await this.optionalEmployee(input.managerId);
      updates.managerId = manager?.id ?? null;
      updates.managerName = manager?.name ?? null;
    }
    await this.database
      .query()
      .updateTable('hrDepartments')
      .set(updates)
      .where('id', '=', current.id)
      .execute();
    const updated = await this.database
      .query()
      .selectFrom('hrDepartments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return updated;
  }

  private async requireDepartment(id: number): Promise<Row> {
    const row = await this.database
      .query()
      .selectFrom('hrDepartments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('department');
    return row;
  }

  // -- employees -----------------------------------------------------------

  public async listEmployees(
    filter: { departmentId?: number },
    actor: HrActor,
  ): Promise<Row[]> {
    const query = this.database.query();
    let builder = query.selectFrom('hrEmployees').selectAll();
    if (actor.isAdmin || actor.isHr) {
      if (filter.departmentId !== undefined) {
        builder = builder.where('departmentId', '=', filter.departmentId);
      }
    } else if (actor.isManager && actor.managedDepartmentIds.length > 0) {
      builder = builder.where('departmentId', 'in', actor.managedDepartmentIds);
      if (filter.departmentId !== undefined) {
        builder = builder.where('departmentId', '=', filter.departmentId);
      }
    } else if (actor.employee) {
      builder = builder.where('id', '=', actor.employee.id);
    } else {
      return [];
    }
    const rows = await builder.orderBy('employeeNo', 'asc').execute();
    return rows;
  }

  public async createEmployee(
    input: EmployeeInput,
    actor: HrActor,
  ): Promise<Row> {
    requireHrOrAdmin(actor);
    const name = requiredString(input.name, 'name');
    const employeeNo = requiredString(input.employeeNo, 'employeeNo');
    const existing = await this.database
      .query()
      .selectFrom('hrEmployees')
      .select('id')
      .where('employeeNo', '=', employeeNo)
      .executeTakeFirst();
    if (existing) {
      throw new HrError(
        'HR_EMPLOYEE_NO_EXISTS',
        409,
        'An employee with this employee number already exists.',
        { employeeNo },
      );
    }
    const departmentId = await this.optionalDepartment(input.departmentId);
    const status = employeeStatus(input.status);
    const annualLeaveDays = nonNegativeInteger(
      input.annualLeaveDays ?? 0,
      'annualLeaveDays',
    );
    const hireDate = optionalDate(input.hireDate);
    const now = new Date();
    await this.database
      .query()
      .insertInto('hrEmployees')
      .values({
        name,
        employeeNo,
        departmentId,
        position: optionalString(input.position),
        hireDate,
        status,
        annualLeaveDays,
        userId: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const created = await this.database
      .query()
      .selectFrom('hrEmployees')
      .selectAll()
      .where('employeeNo', '=', employeeNo)
      .executeTakeFirstOrThrow();
    return created;
  }

  public async updateEmployee(
    id: number,
    input: Partial<EmployeeInput>,
    actor: HrActor,
  ): Promise<Row> {
    requireHrOrAdmin(actor);
    const current = await this.requireEmployee(id);
    const updates: Row = { updatedAt: new Date() };
    if (input.name !== undefined)
      updates.name = requiredString(input.name, 'name');
    if (input.employeeNo !== undefined) {
      const employeeNo = requiredString(input.employeeNo, 'employeeNo');
      const duplicate = await this.database
        .query()
        .selectFrom('hrEmployees')
        .select('id')
        .where('employeeNo', '=', employeeNo)
        .where('id', '!=', id)
        .executeTakeFirst();
      if (duplicate) {
        throw new HrError(
          'HR_EMPLOYEE_NO_EXISTS',
          409,
          'An employee with this employee number already exists.',
          { employeeNo },
        );
      }
      updates.employeeNo = employeeNo;
    }
    if (input.departmentId !== undefined) {
      updates.departmentId = await this.optionalDepartment(input.departmentId);
    }
    if (input.position !== undefined) {
      updates.position = optionalString(input.position);
    }
    if (input.hireDate !== undefined)
      updates.hireDate = optionalDate(input.hireDate);
    if (input.status !== undefined)
      updates.status = employeeStatus(input.status);
    if (input.annualLeaveDays !== undefined) {
      updates.annualLeaveDays = nonNegativeInteger(
        input.annualLeaveDays,
        'annualLeaveDays',
      );
    }
    await this.database
      .query()
      .updateTable('hrEmployees')
      .set(updates)
      .where('id', '=', current.id)
      .execute();
    const updated = await this.database
      .query()
      .selectFrom('hrEmployees')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return updated;
  }

  private async requireEmployee(id: number): Promise<HrEmployeeRecord> {
    const row = await this.database
      .query()
      .selectFrom('hrEmployees')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('employee');
    return toEmployee(row);
  }

  private async optionalEmployee(
    id: number | null | undefined,
  ): Promise<HrEmployeeRecord | null> {
    if (id === null || id === undefined) return null;
    return this.requireEmployee(nonNegativeInteger(id, 'id'));
  }

  private async optionalDepartment(
    id: number | null | undefined,
  ): Promise<number | null> {
    if (id === null || id === undefined) return null;
    const departmentId = nonNegativeInteger(id, 'departmentId');
    await this.requireDepartment(departmentId);
    return departmentId;
  }

  // -- leave ---------------------------------------------------------------

  public async listLeaveRequests(
    filter: { status?: string; employeeId?: number },
    actor: HrActor,
  ): Promise<Row[]> {
    const scope = await this.requestScope(actor);
    const query = this.database.query();
    let builder = query.selectFrom('hrLeaveRequests').selectAll();
    if (scope !== 'all') {
      if (scope.length === 0) return [];
      builder = builder.where('employeeId', 'in', scope);
    }
    if (filter.status !== undefined) {
      builder = builder.where('status', '=', requestStatus(filter.status));
    }
    if (filter.employeeId !== undefined) {
      builder = builder.where('employeeId', '=', filter.employeeId);
    }
    return builder.orderBy('startDate', 'desc').orderBy('id', 'desc').execute();
  }

  public async createLeaveRequest(
    input: LeaveInput,
    actor: HrActor,
  ): Promise<Row> {
    const employee = await this.employeeForWrite(input.employeeId, actor, true);
    const type = leaveType(input.type);
    const annualLeaveDays = employee.annualLeaveDays;
    const usedAnnualLeaveDays = await this.usedAnnualLeaveDays(employee.id);
    const result = evaluateLeaveRequest({
      type,
      startDate: requiredDate(input.startDate, 'startDate'),
      endDate: requiredDate(input.endDate, 'endDate'),
      annualLeaveDays,
      usedAnnualLeaveDays,
    });
    const now = new Date();
    await this.database
      .query()
      .insertInto('hrLeaveRequests')
      .values({
        employeeId: employee.id,
        type,
        startDate: input.startDate,
        endDate: input.endDate,
        days: result.days,
        reason: optionalString(input.reason),
        attachmentId: optionalString(input.attachmentId),
        attachmentName: optionalString(input.attachmentName),
        status: 'pending',
        approverId: null,
        approverName: null,
        approvalComment: null,
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const rows = await this.database
      .query()
      .selectFrom('hrLeaveRequests')
      .selectAll()
      .where('employeeId', '=', employee.id)
      .where('startDate', '=', input.startDate)
      .orderBy('id', 'desc')
      .limit(1)
      .execute();
    return rows[0];
  }

  public async updateLeaveRequest(
    id: number,
    input: Partial<LeaveInput>,
    actor: HrActor,
  ): Promise<Row> {
    const current = await this.requireLeaveRequest(id);
    this.assertCanMutateRequest(current, actor);
    if (String(current.status) === 'approved') {
      throw new HrError(
        'HR_LEAVE_APPROVED_IMMUTABLE',
        409,
        'An approved leave request can no longer be changed.',
      );
    }
    const employee = await this.requireEmployee(Number(current.employeeId));
    const type =
      input.type === undefined
        ? (current.type as LeaveType)
        : leaveType(input.type);
    const startDate =
      input.startDate === undefined
        ? String(current.startDate)
        : requiredDate(input.startDate, 'startDate');
    const endDate =
      input.endDate === undefined
        ? String(current.endDate)
        : requiredDate(input.endDate, 'endDate');
    const usedAnnualLeaveDays = await this.usedAnnualLeaveDays(employee.id, id);
    const result = evaluateLeaveRequest({
      type,
      startDate,
      endDate,
      annualLeaveDays: employee.annualLeaveDays,
      usedAnnualLeaveDays,
    });
    const updates: Row = {
      type,
      startDate,
      endDate,
      days: result.days,
      updatedAt: new Date(),
    };
    if (input.reason !== undefined)
      updates.reason = optionalString(input.reason);
    if (input.attachmentId !== undefined) {
      updates.attachmentId = optionalString(input.attachmentId);
    }
    if (input.attachmentName !== undefined) {
      updates.attachmentName = optionalString(input.attachmentName);
    }
    await this.database
      .query()
      .updateTable('hrLeaveRequests')
      .set(updates)
      .where('id', '=', id)
      .execute();
    return this.requireLeaveRequest(id);
  }

  public async decideLeaveRequest(
    id: number,
    decision: DecisionInput,
    actor: HrActor,
  ): Promise<Row> {
    const current = await this.requireLeaveRequest(id);
    const employee = await this.requireEmployee(Number(current.employeeId));
    this.assertCanDecideRequest(employee.departmentId, actor);
    return this.applyDecision('hrLeaveRequests', current, decision, actor);
  }

  private async requireLeaveRequest(id: number): Promise<Row> {
    const row = await this.database
      .query()
      .selectFrom('hrLeaveRequests')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('leave request');
    return row;
  }

  private async usedAnnualLeaveDays(
    employeeId: number,
    excludeId?: number,
  ): Promise<number> {
    const rows = await this.database
      .query()
      .selectFrom('hrLeaveRequests')
      .select(['id', 'days', 'type', 'status'])
      .where('employeeId', '=', employeeId)
      .where('type', '=', 'annual')
      .where('status', '!=', 'rejected')
      .execute();
    return rows
      .filter((row) => Number(row.id) !== excludeId)
      .reduce((total, row) => total + Number(row.days), 0);
  }

  // -- overtime ------------------------------------------------------------

  public async listOvertimeRequests(
    filter: { status?: string; employeeId?: number },
    actor: HrActor,
  ): Promise<Row[]> {
    const scope = await this.requestScope(actor);
    const query = this.database.query();
    let builder = query.selectFrom('hrOvertimeRequests').selectAll();
    if (scope !== 'all') {
      if (scope.length === 0) return [];
      builder = builder.where('employeeId', 'in', scope);
    }
    if (filter.status !== undefined) {
      builder = builder.where('status', '=', requestStatus(filter.status));
    }
    if (filter.employeeId !== undefined) {
      builder = builder.where('employeeId', '=', filter.employeeId);
    }
    return builder
      .orderBy('overtimeDate', 'desc')
      .orderBy('id', 'desc')
      .execute();
  }

  public async createOvertimeRequest(
    input: OvertimeInput,
    actor: HrActor,
  ): Promise<Row> {
    const employee = await this.employeeForWrite(input.employeeId, actor, true);
    const overtimeDate = requiredDate(input.overtimeDate, 'overtimeDate');
    const hours = parseHours(input.hours);
    const now = new Date();
    await this.database
      .query()
      .insertInto('hrOvertimeRequests')
      .values({
        employeeId: employee.id,
        overtimeDate,
        hours,
        reason: optionalString(input.reason),
        status: 'pending',
        approverId: null,
        approverName: null,
        approvalComment: null,
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const rows = await this.database
      .query()
      .selectFrom('hrOvertimeRequests')
      .selectAll()
      .where('employeeId', '=', employee.id)
      .where('overtimeDate', '=', overtimeDate)
      .orderBy('id', 'desc')
      .limit(1)
      .execute();
    return rows[0];
  }

  public async decideOvertimeRequest(
    id: number,
    decision: DecisionInput,
    actor: HrActor,
  ): Promise<Row> {
    const current = await this.database
      .query()
      .selectFrom('hrOvertimeRequests')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!current) throw notFound('overtime request');
    const employee = await this.requireEmployee(Number(current.employeeId));
    this.assertCanDecideRequest(employee.departmentId, actor);
    return this.applyDecision('hrOvertimeRequests', current, decision, actor);
  }

  private async applyDecision(
    table: 'hrLeaveRequests' | 'hrOvertimeRequests',
    current: Row,
    decision: DecisionInput,
    actor: HrActor,
  ): Promise<Row> {
    const status = requestStatus(decision.status);
    if (status === 'pending') {
      throw invalidInput('A decision must be either approved or rejected.', {
        field: 'status',
      });
    }
    if (String(current.status) !== 'pending') {
      throw new HrError(
        'HR_REQUEST_ALREADY_DECIDED',
        409,
        'This request has already been decided.',
      );
    }
    const comment = optionalString(decision.comment);
    if (status === 'rejected' && !comment) {
      throw new HrError(
        'HR_REJECTION_COMMENT_REQUIRED',
        400,
        'A reason is required when rejecting a request.',
        { field: 'comment' },
      );
    }
    await this.database
      .query()
      .updateTable(table)
      .set({
        status,
        approverId: actor.userId,
        approverName: actor.name,
        approvalComment: comment,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', Number(current.id))
      .execute();
    const updated = await this.database
      .query()
      .selectFrom(table)
      .selectAll()
      .where('id', '=', Number(current.id))
      .executeTakeFirstOrThrow();
    return updated;
  }

  // -- shared authorization helpers ---------------------------------------

  private async requestScope(actor: HrActor): Promise<'all' | number[]> {
    if (actor.isAdmin || actor.isHr) return 'all';
    if (actor.isManager && actor.managedDepartmentIds.length > 0) {
      const rows = await this.database
        .query()
        .selectFrom('hrEmployees')
        .select('id')
        .where('departmentId', 'in', actor.managedDepartmentIds)
        .execute();
      return rows.map((row) => Number(row.id));
    }
    return actor.employee ? [actor.employee.id] : [];
  }

  private async employeeForWrite(
    requested: number | undefined,
    actor: HrActor,
    allowSelf: boolean,
  ): Promise<HrEmployeeRecord> {
    if (actor.isAdmin || actor.isHr) {
      if (requested === undefined) {
        throw invalidInput('An employee must be selected.', {
          field: 'employeeId',
        });
      }
      return this.requireEmployee(nonNegativeInteger(requested, 'employeeId'));
    }
    if (!actor.employee) {
      if (allowSelf) {
        throw new HrError(
          'HR_EMPLOYEE_PROFILE_MISSING',
          400,
          'No employee profile is linked to this account yet.',
        );
      }
      throw forbidden();
    }
    if (requested !== undefined && requested !== actor.employee.id) {
      throw forbidden();
    }
    return actor.employee;
  }

  private assertCanMutateRequest(current: Row, actor: HrActor): void {
    if (actor.isAdmin || actor.isHr) return;
    if (actor.employee && Number(current.employeeId) === actor.employee.id)
      return;
    throw forbidden();
  }

  private assertCanDecideRequest(
    departmentId: number | null,
    actor: HrActor,
  ): void {
    if (actor.isAdmin || actor.isHr) return;
    if (
      actor.isManager &&
      departmentId !== null &&
      actor.managedDepartmentIds.includes(departmentId)
    ) {
      return;
    }
    throw forbidden();
  }

  // -- attachments ---------------------------------------------------------

  /**
   * An attachment may be downloaded by whoever can read the leave request it
   * belongs to. An attachment that is not referenced yet is reachable by any
   * signed-in user (the uploader, before the request is saved).
   */
  public async canAccessAttachment(
    attachmentId: string,
    actor: HrActor,
  ): Promise<boolean> {
    const rows = await this.database
      .query()
      .selectFrom('hrLeaveRequests')
      .select('employeeId')
      .where('attachmentId', '=', attachmentId)
      .execute();
    if (rows.length === 0) return true;
    if (actor.isAdmin || actor.isHr) return true;
    const scope = await this.requestScope(actor);
    if (scope === 'all') return true;
    return rows.some((row) => scope.includes(Number(row.employeeId)));
  }

  // -- statistics ----------------------------------------------------------

  public async statistics(actor: HrActor): Promise<StatisticsResult> {
    if (!actor.isAdmin && !actor.isHr && !actor.isManager) {
      throw forbidden();
    }
    const scope = await this.requestScope(actor);
    const [departments, employees, leaves, overtimes] = await Promise.all([
      this.database.query().selectFrom('hrDepartments').selectAll().execute(),
      this.employeeRowsForScope(scope),
      this.requestRowsForScope('hrLeaveRequests', scope),
      this.requestRowsForScope('hrOvertimeRequests', scope),
    ]);

    const departmentName = new Map<number, string>();
    for (const row of departments) {
      departmentName.set(Number(row.id), String(row.name));
    }
    const employeeById = new Map<number, Row>();
    for (const row of employees) employeeById.set(Number(row.id), row);

    const leaveDaysByDepartment = new Map<number | null, number>();
    for (const row of leaves) {
      if (String(row.status) === 'rejected') continue;
      const employee = employeeById.get(Number(row.employeeId));
      const departmentId = employee
        ? toNullableNumber(employee.departmentId)
        : null;
      leaveDaysByDepartment.set(
        departmentId,
        (leaveDaysByDepartment.get(departmentId) ?? 0) + Number(row.days),
      );
    }

    const usedAnnual = new Map<number, number>();
    for (const row of leaves) {
      if (String(row.type) !== 'annual') continue;
      if (String(row.status) === 'rejected') continue;
      const employeeId = Number(row.employeeId);
      usedAnnual.set(
        employeeId,
        (usedAnnual.get(employeeId) ?? 0) + Number(row.days),
      );
    }

    const month = currentMonth();
    const overtimeHoursByDepartment = new Map<number | null, number>();
    let overtimeHoursThisMonth = 0;
    for (const row of overtimes) {
      if (String(row.status) === 'rejected') continue;
      if (!String(row.overtimeDate).startsWith(month)) continue;
      const hours = Number(row.hours);
      overtimeHoursThisMonth += hours;
      const employee = employeeById.get(Number(row.employeeId));
      const departmentId = employee
        ? toNullableNumber(employee.departmentId)
        : null;
      overtimeHoursByDepartment.set(
        departmentId,
        (overtimeHoursByDepartment.get(departmentId) ?? 0) + hours,
      );
    }

    const employeeStats = employees.map((row) => {
      const id = Number(row.id);
      const annualLeaveDays = Number(row.annualLeaveDays);
      const used = usedAnnual.get(id) ?? 0;
      const departmentId = toNullableNumber(row.departmentId);
      return {
        employeeId: id,
        employeeName: String(row.name),
        employeeNo: String(row.employeeNo),
        departmentName:
          departmentId === null ? '' : (departmentName.get(departmentId) ?? ''),
        annualLeaveDays,
        usedAnnualLeaveDays: used,
        remainingAnnualLeaveDays: annualLeaveDays - used,
      };
    });

    const departmentIds = new Set<number | null>(
      departments.map((row) => Number(row.id)),
    );
    if (
      leaveDaysByDepartment.has(null) ||
      overtimeHoursByDepartment.has(null)
    ) {
      departmentIds.add(null);
    }
    const departmentStats = [...departmentIds]
      .map((departmentId) => ({
        departmentId,
        departmentName:
          departmentId === null ? '' : (departmentName.get(departmentId) ?? ''),
        leaveDays: leaveDaysByDepartment.get(departmentId) ?? 0,
        overtimeHours:
          Math.round((overtimeHoursByDepartment.get(departmentId) ?? 0) * 100) /
          100,
      }))
      .sort(
        (a, b) =>
          b.leaveDays - a.leaveDays || b.overtimeHours - a.overtimeHours,
      );

    return {
      month,
      departments: departmentStats,
      employees: employeeStats,
      overtimeHoursThisMonth: Math.round(overtimeHoursThisMonth * 100) / 100,
    };
  }

  private async employeeRowsForScope(scope: 'all' | number[]): Promise<Row[]> {
    const query = this.database.query();
    let builder = query.selectFrom('hrEmployees').selectAll();
    if (scope !== 'all') {
      if (scope.length === 0) return [];
      builder = builder.where('id', 'in', scope);
    }
    return builder.orderBy('employeeNo', 'asc').execute();
  }

  private async requestRowsForScope(
    table: 'hrLeaveRequests' | 'hrOvertimeRequests',
    scope: 'all' | number[],
  ): Promise<Row[]> {
    const query = this.database.query();
    let builder = query.selectFrom(table).selectAll();
    if (scope !== 'all') {
      if (scope.length === 0) return [];
      builder = builder.where('employeeId', 'in', scope);
    }
    return builder.execute();
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function requireHrOrAdmin(actor: HrActor): void {
  if (!actor.isAdmin && !actor.isHr) throw forbidden();
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw invalidInput(`${field} is required.`, { field });
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Reads a scalar column as a string without stringifying arbitrary objects. */
function stringValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value.toString();
  }
  return null;
}

function requiredDate(value: unknown, field: string): string {
  if (!isIsoDate(value)) {
    throw invalidInput(`${field} must be a valid YYYY-MM-DD date.`, { field });
  }
  return value;
}

function optionalDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return requiredDate(value, 'hireDate');
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableNumber(value: unknown): number | null {
  return optionalNumber(value);
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw invalidInput(`${field} must be a non-negative integer.`, { field });
  }
  return parsed;
}

function employeeStatus(value: unknown): string {
  if (value === undefined) return 'active';
  if (
    typeof value !== 'string' ||
    !(EMPLOYEE_STATUSES as readonly string[]).includes(value)
  ) {
    throw invalidInput('Unknown employee status.', { field: 'status' });
  }
  return value;
}

function leaveType(value: unknown): LeaveType {
  if (typeof value !== 'string' || !LEAVE_TYPES.includes(value as LeaveType)) {
    throw invalidInput('Unknown leave type.', { field: 'type' });
  }
  return value as LeaveType;
}

function requestStatus(value: unknown): RequestStatus {
  if (
    typeof value !== 'string' ||
    !(LEAVE_STATUSES as readonly string[]).includes(value)
  ) {
    throw invalidInput('Unknown request status.', { field: 'status' });
  }
  return value as RequestStatus;
}

function toEmployee(row: Row): HrEmployeeRecord {
  return {
    id: Number(row.id),
    name: String(row.name),
    employeeNo: String(row.employeeNo),
    departmentId: toNullableNumber(row.departmentId),
    position: stringValue(row.position),
    hireDate: stringValue(row.hireDate),
    status: String(row.status),
    annualLeaveDays: Number(row.annualLeaveDays),
    userId: stringValue(row.userId),
  };
}

function currentMonth(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
