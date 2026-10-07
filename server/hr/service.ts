/**
 * The HR domain service.
 *
 * It owns every rule the requirement states that a route cannot express:
 * which rows an actor may see, which fields of an employee are confidential,
 * who may decide a leave request, and when a rejected request may be edited
 * and resubmitted. Routes stay thin — they authenticate, validate input,
 * delegate here, and translate the domain errors below into API errors.
 *
 * The service never sees a Hono context; the caller passes an
 * `AuthorizationContext` and the service reads the identity from it.
 */
import type { Application } from '@nocobase/app-server/application';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import type { FilterNode } from '@nocobase/repository-input';
import { createServiceToken } from '@nocobase/service-provider';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { loggingToken } from '@nocobase/app-server/logging';
import type { Logger } from '@nocobase/logging';
import {
  userAdministrationServiceToken,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication';
import {
  EMPLOYEE_SET_KEY,
  HR_SET_KEY,
  HR_PAGE_IDS,
  SUPERVISOR_SET_KEY,
  defineHrPermissionSets,
} from './resources.js';
import type {
  HrActor,
  HrDepartmentRow,
  HrEmployeeRow,
  HrEmployeeView,
  HrLeaveRequestRow,
  HrNotificationRow,
} from './types.js';

export const hrServiceToken = createServiceToken<HrService>('hr.service');

/** The shared password of every account the sample data provisions. */
export const HR_DEMO_PASSWORD = 'HrDemo!2345';

/** A domain failure a route turns into the matching API error. */
export class HrError extends Error {
  constructor(
    readonly status:
      | 'INVALID_ARGUMENT'
      | 'NOT_FOUND'
      | 'PERMISSION_DENIED'
      | 'FAILED_PRECONDITION'
      | 'ALREADY_EXISTS',
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'HrError';
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The subset of the repository FilterBuilder this service uses. */
interface FilterBuilderLike {
  string(path: string): {
    eq(value: string | null): FilterNode;
    includes(
      value: string,
      options?: { mode?: 'default' | 'insensitive' },
    ): FilterNode;
  };
  number(path: string): { eq(value: number | string | null): FilterNode };
  and(items: readonly FilterNode[]): FilterNode;
  or(items: readonly FilterNode[]): FilterNode;
}

/**
 * The managed collections declare NOT NULL `createdAt`/`updatedAt` with no
 * database default, exactly as the framework's own tables do, so every write
 * supplies its own timestamps.
 */
function createStamp(): { createdAt: Date; updatedAt: Date } {
  const now = new Date();
  return { createdAt: now, updatedAt: now };
}

function updateStamp(): { updatedAt: Date } {
  return { updatedAt: new Date() };
}

/**
 * The notification table is an append-only log with no `updatedAt` column, so
 * it stamps only the creation time.
 */
function createdStamp(): { createdAt: Date } {
  return { createdAt: new Date() };
}

function inclusiveDays(start: string, end: string): number {
  return Math.max(
    1,
    Math.floor((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1,
  );
}

/** A department title lookup so an employee row can carry its title. */
type DepartmentTitles = ReadonlyMap<number, string>;

export class HrService {
  private provisioning?: Promise<void>;

  constructor(private readonly app: Application) {}

  private get db(): DatabaseManager {
    return this.app.container.resolve(databaseManagerToken);
  }

  private get users(): UserAdministrationService {
    return this.app.container.resolve(userAdministrationServiceToken);
  }

  private get authz(): AppAuthorization {
    return this.app.container.resolve(authorizationToken);
  }

  private get logger(): Logger {
    return this.app.container.resolve(loggingToken).getLogger('hr');
  }

  private departments(): Repository<HrDepartmentRow> {
    return this.db.repository<HrDepartmentRow>('hrDepartments');
  }

  private employees(): Repository<HrEmployeeRow> {
    return this.db.repository<HrEmployeeRow>('hrEmployees');
  }

  private leaveRequests(): Repository<HrLeaveRequestRow> {
    return this.db.repository<HrLeaveRequestRow>('hrLeaveRequests');
  }

  private notifications(): Repository<HrNotificationRow> {
    return this.db.repository<HrNotificationRow>('hrNotifications');
  }

  // --- actor -----------------------------------------------------------------

  /** Resolves what one request's identity may do, in one place. */
  async resolveActor(context: AuthorizationContext): Promise<HrActor> {
    const { identity } = context;
    const snapshot = await context.snapshot();
    const sets = await this.authz.permissionSets.getEffective({
      principal: identity.principal,
      subjects: identity.subjects,
    });
    const keys = new Set(sets.map((set) => set.key));

    const principal = identity.principal;
    const userId = principal.type === 'user' ? String(principal.id) : '';
    if (!userId) {
      throw new HrError(
        'PERMISSION_DENIED',
        'HR_NO_IDENTITY',
        'This request has no user identity.',
      );
    }

    const employee = await this.employees().findOne({ filter: { userId } });
    const managed = await this.departments().findMany({
      filter: (filter) => filter.string('managerId').eq(userId),
    });

    return {
      userId,
      unrestricted: snapshot.unrestricted,
      isHr: snapshot.unrestricted || keys.has(HR_SET_KEY),
      isSupervisor: keys.has(SUPERVISOR_SET_KEY),
      employee: employee ?? null,
      managedDepartmentIds: managed.map((department) => department.id),
    };
  }

  /** A signed-in person who is not part of the HR module at all. */
  private assertMember(actor: HrActor): void {
    if (
      !actor.unrestricted &&
      !actor.isHr &&
      !actor.isSupervisor &&
      !actor.employee
    ) {
      throw new HrError(
        'PERMISSION_DENIED',
        'HR_NOT_A_MEMBER',
        'This account is not part of the HR module.',
      );
    }
  }

  private assertHr(actor: HrActor): void {
    if (!actor.isHr) {
      throw new HrError(
        'PERMISSION_DENIED',
        'HR_HR_ONLY',
        'Only HR may perform this action.',
      );
    }
  }

  private assertApprover(actor: HrActor): void {
    if (!actor.isHr && !actor.isSupervisor) {
      throw new HrError(
        'PERMISSION_DENIED',
        'HR_APPROVER_ONLY',
        'Only HR or a supervisor may decide a leave request.',
      );
    }
  }

  private assertManagedDepartment(
    actor: HrActor,
    departmentId: number | null,
  ): void {
    if (actor.isHr || actor.unrestricted) return;
    if (
      departmentId != null &&
      actor.managedDepartmentIds.includes(departmentId)
    )
      return;
    throw new HrError(
      'PERMISSION_DENIED',
      'HR_NOT_YOUR_DEPARTMENT',
      'This record belongs to another department.',
    );
  }

  // --- serialization ---------------------------------------------------------

  private async departmentTitles(): Promise<DepartmentTitles> {
    const rows = await this.departments().findMany({
      sort: (sort) => [sort.field('sortOrder').asc(), sort.field('id').asc()],
    });
    return new Map(rows.map((row) => [row.id, row.title]));
  }

  /**
   * Applies field confidentiality. HR and the person themselves see the whole
   * record; a supervisor who is not HR sees only what the requirement allows.
   */
  private viewEmployee(
    row: HrEmployeeRow,
    actor: HrActor,
    titles: DepartmentTitles,
  ): HrEmployeeView {
    const base: HrEmployeeView = {
      id: row.id,
      employeeNo: row.employeeNo,
      name: row.name,
      position: row.position,
      status: row.status,
      departmentId: row.departmentId,
      departmentTitle:
        row.departmentId == null
          ? null
          : (titles.get(row.departmentId) ?? null),
    };

    const isSelf = row.userId != null && row.userId === actor.userId;
    if (!actor.isHr && !isSelf) return base;

    return {
      ...base,
      userId: row.userId,
      hireDate: row.hireDate,
      offboardedAt: row.offboardedAt,
      email: row.email,
      phone: row.phone,
      idNumber: row.idNumber,
      idDocumentUrl: row.idDocumentUrl,
      contractNo: row.contractNo,
      contractStartDate: row.contractStartDate,
      contractEndDate: row.contractEndDate,
      contractUrl: row.contractUrl,
      attachments: row.attachments,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // --- dashboard -------------------------------------------------------------

  private departmentScope(actor: HrActor): readonly number[] | null {
    if (actor.isHr || actor.unrestricted) return null;
    if (actor.isSupervisor) return actor.managedDepartmentIds;
    if (actor.employee?.departmentId != null)
      return [actor.employee.departmentId];
    return [];
  }

  /**
   * The homepage numbers for the signed-in identity.
   *
   * The landing page is open to every signed-in user, including one who is not
   * part of the HR module, so this does not require membership: a non-member
   * falls into the empty scope and reads zeros rather than a refusal.
   */
  async dashboard(actor: HrActor): Promise<{
    activeEmployees: number;
    onboardingEmployees: number;
    pendingLeaveRequests: number;
    departments: number;
    myPendingLeaveRequests: number;
    myRejectedLeaveRequests: number;
    isHr: boolean;
    isSupervisor: boolean;
    employeeId: number | null;
  }> {
    const scope = this.departmentScope(actor);

    /** A `departmentId` condition for the actor's scope; `undefined` means all. */
    const scopeNode = (filter: FilterBuilderLike): FilterNode | undefined => {
      if (scope == null) return undefined;
      if (scope.length === 0) return filter.number('departmentId').eq(-1);
      if (scope.length === 1) return filter.number('departmentId').eq(scope[0]);
      return filter.or(scope.map((id) => filter.number('departmentId').eq(id)));
    };

    const countEmployees = (status: string) =>
      this.employees().count({
        filter: (filter) => {
          const node = scopeNode(filter);
          const statusNode = filter.string('status').eq(status);
          return node ? filter.and([statusNode, node]) : statusNode;
        },
      });

    const activeEmployees = await countEmployees('active');
    const onboardingEmployees = await countEmployees('onboarding');
    const pendingLeaveRequests = await this.leaveRequests().count({
      filter: (filter) => {
        const node = scopeNode(filter);
        const statusNode = filter.string('status').eq('pending');
        return node ? filter.and([statusNode, node]) : statusNode;
      },
    });
    // A supervisor sees the headcount of the departments they manage; a plain
    // employee sees their own department; HR or an unrestricted account sees
    // every department.
    const departments =
      scope == null
        ? await this.departments().count()
        : scope.length === 0
          ? 0
          : await this.departments().count({
              filter: (filter) =>
                filter.or(scope.map((id) => filter.number('id').eq(id))),
            });

    const myPendingLeaveRequests = actor.employee
      ? await this.leaveRequests().count({
          filter: (filter) =>
            filter.and([
              filter.number('employeeId').eq(actor.employee!.id),
              filter.string('status').eq('pending'),
            ]),
        })
      : 0;
    const myRejectedLeaveRequests = actor.employee
      ? await this.leaveRequests().count({
          filter: (filter) =>
            filter.and([
              filter.number('employeeId').eq(actor.employee!.id),
              filter.string('status').eq('rejected'),
            ]),
        })
      : 0;

    return {
      activeEmployees,
      onboardingEmployees,
      pendingLeaveRequests,
      departments,
      myPendingLeaveRequests,
      myRejectedLeaveRequests,
      isHr: actor.isHr,
      isSupervisor: actor.isSupervisor,
      employeeId: actor.employee?.id ?? null,
    };
  }

  // --- departments -----------------------------------------------------------

  async listDepartments(actor: HrActor): Promise<HrDepartmentRow[]> {
    this.assertMember(actor);
    return this.departments().findMany({
      sort: (sort) => [sort.field('sortOrder').asc(), sort.field('id').asc()],
    });
  }

  async createDepartment(
    actor: HrActor,
    input: Partial<HrDepartmentRow>,
  ): Promise<HrDepartmentRow> {
    this.assertHr(actor);
    if (!input.title) {
      throw new HrError(
        'INVALID_ARGUMENT',
        'HR_TITLE_REQUIRED',
        'A department needs a title.',
      );
    }
    return (
      await this.departments().createOne({
        values: {
          ...createStamp(),
          title: input.title,
          code: input.code ?? null,
          parentId: input.parentId ?? null,
          managerId: input.managerId ?? null,
          active: input.active ?? true,
          sortOrder: input.sortOrder ?? 0,
          description: input.description ?? null,
        },
      })
    ).record;
  }

  async updateDepartment(
    actor: HrActor,
    id: number,
    input: Partial<HrDepartmentRow>,
  ): Promise<HrDepartmentRow> {
    this.assertHr(actor);
    const existing = await this.departments().findOne({ filter: { id } });
    if (!existing)
      throw new HrError(
        'NOT_FOUND',
        'HR_DEPARTMENT_NOT_FOUND',
        'No such department.',
      );
    const values: Record<string, unknown> = {};
    for (const key of [
      'title',
      'code',
      'parentId',
      'managerId',
      'active',
      'sortOrder',
      'description',
    ] as const) {
      if (input[key] !== undefined) values[key] = input[key];
    }
    return (await this.departments().updateOne({ filter: { id }, values }))
      .record;
  }

  // --- employees -------------------------------------------------------------

  /**
   * The rows an actor may list: everything for HR, the actor's departments for
   * a supervisor, and their own record for anyone else.
   */
  async listEmployees(
    actor: HrActor,
    query: { status?: string; departmentId?: number; search?: string },
  ): Promise<HrEmployeeView[]> {
    this.assertMember(actor);
    const titles = await this.departmentTitles();
    const rows = await this.employees().findMany({
      filter: (filter) => {
        const parts = [];
        if (query.status) parts.push(filter.string('status').eq(query.status));
        if (query.departmentId != null)
          parts.push(filter.number('departmentId').eq(query.departmentId));
        if (query.search) {
          parts.push(
            filter.or([
              filter
                .string('name')
                .includes(query.search, { mode: 'insensitive' }),
              filter
                .string('employeeNo')
                .includes(query.search, { mode: 'insensitive' }),
            ]),
          );
        }
        if (!actor.isHr && !actor.unrestricted) {
          if (actor.isSupervisor) {
            const ids = actor.managedDepartmentIds;
            parts.push(
              ids.length === 0
                ? filter.number('departmentId').eq(-1)
                : filter.or(
                    ids.map((id) => filter.number('departmentId').eq(id)),
                  ),
            );
          } else if (actor.employee) {
            parts.push(filter.number('id').eq(actor.employee.id));
          } else {
            parts.push(filter.number('id').eq(-1));
          }
        }
        return parts.length === 0
          ? filter.string('status').notEmpty()
          : filter.and(parts);
      },
      sort: (sort) => sort.field('id').asc(),
    });
    return rows.map((row) => this.viewEmployee(row, actor, titles));
  }

  async getEmployee(actor: HrActor, id: number): Promise<HrEmployeeView> {
    this.assertMember(actor);
    const row = await this.employees().findOne({ filter: { id } });
    if (!row)
      throw new HrError(
        'NOT_FOUND',
        'HR_EMPLOYEE_NOT_FOUND',
        'No such employee.',
      );
    this.assertEmployeeVisible(actor, row);
    const titles = await this.departmentTitles();
    return this.viewEmployee(row, actor, titles);
  }

  private assertEmployeeVisible(actor: HrActor, row: HrEmployeeRow): void {
    if (actor.isHr || actor.unrestricted) return;
    if (row.userId != null && row.userId === actor.userId) return;
    if (
      actor.isSupervisor &&
      row.departmentId != null &&
      actor.managedDepartmentIds.includes(row.departmentId)
    ) {
      return;
    }
    throw new HrError(
      'PERMISSION_DENIED',
      'HR_EMPLOYEE_FORBIDDEN',
      'This employee is outside your scope.',
    );
  }

  async createEmployee(
    actor: HrActor,
    input: {
      name: string;
      employeeNo?: string;
      email?: string;
      phone?: string;
      departmentId?: number;
      position?: string;
      hireDate?: string;
      openAccount?: boolean;
      idNumber?: string;
      contractNo?: string;
      contractStartDate?: string;
      contractEndDate?: string;
      notes?: string;
    },
  ): Promise<HrEmployeeView> {
    this.assertHr(actor);
    if (!input.name) {
      throw new HrError(
        'INVALID_ARGUMENT',
        'HR_NAME_REQUIRED',
        'An employee needs a name.',
      );
    }
    let employeeNo = input.employeeNo?.trim();
    if (!employeeNo) {
      // Derive the next number from the highest one already used, not from a
      // row count: a count repeats a number as soon as anyone is offboarded.
      const rows = await this.employees().findMany({});
      let highest = 1000;
      for (const row of rows) {
        const match = /^E(\d+)$/.exec(row.employeeNo);
        if (match) highest = Math.max(highest, Number(match[1]));
      }
      employeeNo = `E${highest + 1}`;
    }
    const status = input.openAccount ? 'active' : 'onboarding';
    const created = (
      await this.employees().createOne({
        values: {
          ...createStamp(),
          employeeNo,
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          departmentId: input.departmentId ?? null,
          position: input.position ?? null,
          status,
          hireDate: input.hireDate ?? null,
          idNumber: input.idNumber ?? null,
          contractNo: input.contractNo ?? null,
          contractStartDate: input.contractStartDate ?? null,
          contractEndDate: input.contractEndDate ?? null,
          notes: input.notes ?? null,
        },
      })
    ).record;

    if (input.openAccount) {
      await this.openAccountFor(actor, created.id, {
        email: input.email,
        username: input.employeeNo,
      });
    }
    return this.getEmployee(actor, created.id);
  }

  async updateEmployee(
    actor: HrActor,
    id: number,
    input: Record<string, unknown>,
  ): Promise<HrEmployeeView> {
    this.assertHr(actor);
    const existing = await this.employees().findOne({ filter: { id } });
    if (!existing)
      throw new HrError(
        'NOT_FOUND',
        'HR_EMPLOYEE_NOT_FOUND',
        'No such employee.',
      );
    const writable = [
      'employeeNo',
      'name',
      'departmentId',
      'position',
      'status',
      'hireDate',
      'email',
      'phone',
      'idNumber',
      'idDocumentUrl',
      'contractNo',
      'contractStartDate',
      'contractEndDate',
      'contractUrl',
      'attachments',
      'notes',
    ] as const;
    const values: Record<string, unknown> = {};
    for (const key of writable) {
      if (input[key] !== undefined) values[key] = input[key];
    }
    if (Object.keys(values).length === 0) return this.getEmployee(actor, id);
    await this.employees().updateOne({
      filter: { id },
      values: { ...updateStamp(), ...values },
    });
    return this.getEmployee(actor, id);
  }

  /**
   * Onboarding opens an account and makes the employee active; offboarding
   * disables the account and keeps every business record the person created.
   */
  async changeEmployeeLifecycle(
    actor: HrActor,
    id: number,
    action: 'onboard' | 'offboard',
    options: { email?: string; username?: string } = {},
  ): Promise<HrEmployeeView> {
    this.assertHr(actor);
    const existing = await this.employees().findOne({ filter: { id } });
    if (!existing)
      throw new HrError(
        'NOT_FOUND',
        'HR_EMPLOYEE_NOT_FOUND',
        'No such employee.',
      );

    if (action === 'onboard') {
      if (existing.userId) {
        if (existing.status !== 'active') {
          await this.employees().updateOne({
            filter: { id },
            values: { ...updateStamp(), status: 'active' },
          });
        }
        return this.getEmployee(actor, id);
      }
      await this.openAccountFor(actor, id, {
        email: options.email ?? existing.email ?? undefined,
        username: options.username ?? existing.employeeNo,
      });
      return this.getEmployee(actor, id);
    }

    if (existing.userId) {
      try {
        await this.users.disable(existing.userId);
      } catch (error) {
        this.logger.warn(
          `HR: could not disable account for employee ${id}: ${String(error)}`,
        );
      }
    }
    await this.employees().updateOne({
      filter: { id },
      values: {
        ...updateStamp(),
        status: 'offboarded',
        offboardedAt: new Date(),
      },
    });
    return this.getEmployee(actor, id);
  }

  /** Creates the account, links it, marks the employee active, and notifies them. */
  private async openAccountFor(
    actor: HrActor,
    employeeId: number,
    options: { email?: string; username?: string },
  ): Promise<void> {
    const employee = await this.employees().findOne({
      filter: { id: employeeId },
    });
    if (!employee)
      throw new HrError(
        'NOT_FOUND',
        'HR_EMPLOYEE_NOT_FOUND',
        'No such employee.',
      );
    const email = (options.email ?? employee.email ?? '').trim();
    if (!email) {
      throw new HrError(
        'FAILED_PRECONDITION',
        'HR_EMAIL_REQUIRED',
        'An email address is required before an account can be opened.',
      );
    }
    const username = (options.username ?? employee.employeeNo).trim();
    const user = await this.ensureUser({
      name: employee.name,
      email,
      username,
    });
    await this.employees().updateOne({
      filter: { id: employeeId },
      values: {
        ...updateStamp(),
        userId: String(user.id),
        status: 'active',
        email: email,
      },
    });
    await this.assignPermissionSet(String(user.id), EMPLOYEE_SET_KEY, [
      HR_SET_KEY,
      SUPERVISOR_SET_KEY,
    ]);
    await this.notify(
      String(user.id),
      'Your account is ready',
      `Welcome ${employee.name}. You can now sign in as ${email}.`,
      'onboarding',
      employeeId,
    );
    this.logger.info(
      `HR: opened account ${email} for employee ${employee.name}`,
    );
    void actor;
  }

  // --- leave -----------------------------------------------------------------

  async listLeaveRequests(
    actor: HrActor,
    query: { status?: string; mine?: boolean },
  ): Promise<HrLeaveRequestRow[]> {
    this.assertMember(actor);
    const rows = await this.leaveRequests().findMany({
      filter: (filter) => {
        const parts = [];
        if (query.status) parts.push(filter.string('status').eq(query.status));
        if (query.mine) {
          if (!actor.employee) return filter.number('id').eq(-1);
          parts.push(filter.number('employeeId').eq(actor.employee.id));
        } else if (!actor.isHr && !actor.unrestricted) {
          if (actor.isSupervisor) {
            const ids = actor.managedDepartmentIds;
            parts.push(
              ids.length === 0
                ? filter.number('id').eq(-1)
                : filter.or(
                    ids.map((id) => filter.number('departmentId').eq(id)),
                  ),
            );
          } else if (actor.employee) {
            parts.push(filter.number('employeeId').eq(actor.employee.id));
          } else {
            parts.push(filter.number('id').eq(-1));
          }
        }
        return parts.length === 0
          ? filter.string('status').notEmpty()
          : filter.and(parts);
      },
      sort: (sort) => sort.field('id').desc(),
    });
    return rows;
  }

  async applyLeave(
    actor: HrActor,
    input: {
      type?: string;
      startDate: string;
      endDate: string;
      reason?: string;
    },
  ): Promise<HrLeaveRequestRow> {
    this.assertMember(actor);
    if (!actor.employee) {
      throw new HrError(
        'FAILED_PRECONDITION',
        'HR_NO_EMPLOYEE_RECORD',
        'Your account is not linked to an employee record yet.',
      );
    }
    if (Date.parse(input.endDate) < Date.parse(input.startDate)) {
      throw new HrError(
        'INVALID_ARGUMENT',
        'HR_BAD_DATE_RANGE',
        'The end date cannot precede the start date.',
      );
    }
    const row = (
      await this.leaveRequests().createOne({
        values: {
          ...createStamp(),
          employeeId: actor.employee.id,
          userId: actor.employee.userId,
          departmentId: actor.employee.departmentId,
          type: input.type ?? 'annual',
          startDate: input.startDate,
          endDate: input.endDate,
          days: inclusiveDays(input.startDate, input.endDate),
          reason: input.reason ?? null,
          status: 'pending',
          revision: 1,
          submittedAt: new Date(),
        },
      })
    ).record;
    return row;
  }

  /**
   * Edits a request. A rejected request is resubmitted for approval, bumping
   * its revision and clearing the previous decision; only the owner may edit,
   * and only while it is pending or rejected.
   */
  async updateLeaveRequest(
    actor: HrActor,
    id: number,
    input: {
      type?: string;
      startDate?: string;
      endDate?: string;
      reason?: string;
      resubmit?: boolean;
    },
  ): Promise<HrLeaveRequestRow> {
    this.assertMember(actor);
    const existing = await this.leaveRequests().findOne({ filter: { id } });
    if (!existing)
      throw new HrError(
        'NOT_FOUND',
        'HR_LEAVE_NOT_FOUND',
        'No such leave request.',
      );

    const isOwner =
      (existing.userId != null && existing.userId === actor.userId) ||
      (actor.employee != null && existing.employeeId === actor.employee.id);
    if (!isOwner && !actor.isHr) {
      throw new HrError(
        'PERMISSION_DENIED',
        'HR_LEAVE_NOT_OWNER',
        'You may edit only your own leave requests.',
      );
    }
    if (existing.status === 'approved') {
      throw new HrError(
        'FAILED_PRECONDITION',
        'HR_LEAVE_APPROVED',
        'An approved leave request cannot be edited.',
      );
    }
    if (input.resubmit && existing.status !== 'rejected') {
      throw new HrError(
        'FAILED_PRECONDITION',
        'HR_LEAVE_NOT_REJECTED',
        'Only a rejected leave request can be resubmitted.',
      );
    }
    if (!input.resubmit && existing.status === 'rejected') {
      throw new HrError(
        'FAILED_PRECONDITION',
        'HR_LEAVE_RESUBMIT_REQUIRED',
        'Set resubmit to edit a rejected request.',
      );
    }

    const startDate = input.startDate ?? existing.startDate;
    const endDate = input.endDate ?? existing.endDate;
    if (Date.parse(endDate) < Date.parse(startDate)) {
      throw new HrError(
        'INVALID_ARGUMENT',
        'HR_BAD_DATE_RANGE',
        'The end date cannot precede the start date.',
      );
    }

    const values: Record<string, unknown> = {
      type: input.type ?? existing.type,
      startDate,
      endDate,
      days: inclusiveDays(startDate, endDate),
      reason: input.reason ?? existing.reason,
    };
    if (input.resubmit) {
      values.status = 'pending';
      values.revision = existing.revision + 1;
      values.submittedAt = new Date();
      values.approverId = null;
      values.approverName = null;
      values.decidedAt = null;
      values.rejectionReason = null;
    }
    return (await this.leaveRequests().updateOne({ filter: { id }, values }))
      .record;
  }

  /** Approves or rejects; a rejection must carry a reason, and the applicant is told. */
  async decideLeaveRequest(
    actor: HrActor,
    id: number,
    decision: 'approved' | 'rejected',
    rejectionReason?: string,
  ): Promise<HrLeaveRequestRow> {
    this.assertApprover(actor);
    const existing = await this.leaveRequests().findOne({ filter: { id } });
    if (!existing)
      throw new HrError(
        'NOT_FOUND',
        'HR_LEAVE_NOT_FOUND',
        'No such leave request.',
      );
    if (existing.status !== 'pending') {
      throw new HrError(
        'FAILED_PRECONDITION',
        'HR_LEAVE_DECIDED',
        'This leave request has already been decided.',
      );
    }
    this.assertManagedDepartment(actor, existing.departmentId);
    const trimmed = rejectionReason?.trim();
    if (decision === 'rejected' && !trimmed) {
      throw new HrError(
        'INVALID_ARGUMENT',
        'HR_REJECTION_REASON_REQUIRED',
        'A rejection must state a reason.',
      );
    }

    const approverName = actor.employee?.name ?? 'HR';
    const updated = (
      await this.leaveRequests().updateOne({
        filter: { id },
        values: {
          ...updateStamp(),
          status: decision,
          approverId: actor.userId,
          approverName,
          decidedAt: new Date(),
          rejectionReason: decision === 'rejected' ? trimmed : null,
        },
      })
    ).record;

    const applicantName = await this.employeeName(existing.employeeId);
    const applicantUserId =
      existing.userId ?? (await this.employeeUserId(existing.employeeId));
    await this.notify(
      applicantUserId,
      decision === 'approved'
        ? 'Leave request approved'
        : 'Leave request rejected',
      decision === 'approved'
        ? `Your ${existing.type} leave for ${existing.startDate}–${existing.endDate} was approved.`
        : `Your ${existing.type} leave for ${existing.startDate}–${existing.endDate} was rejected: ${trimmed} You can edit and resubmit it.`,
      'leave-request',
      existing.id,
    );
    this.logger.info(
      `HR: ${approverName} ${decision} leave request ${existing.id} (${applicantName})`,
    );
    return updated;
  }

  private async employeeName(employeeId: number): Promise<string> {
    const row = await this.employees().findOne({ filter: { id: employeeId } });
    return row?.name ?? String(employeeId);
  }

  /**
   * The account a leave request belongs to. A seeded row may predate the
   * account link, so fall back to the employee record rather than dropping the
   * notification.
   */
  private async employeeUserId(employeeId: number): Promise<string | null> {
    const row = await this.employees().findOne({ filter: { id: employeeId } });
    return row?.userId ?? null;
  }

  // --- notifications ---------------------------------------------------------

  async listNotifications(actor: HrActor): Promise<HrNotificationRow[]> {
    this.assertMember(actor);
    return this.notifications().findMany({
      filter: { userId: actor.userId },
      sort: (sort) => sort.field('id').desc(),
      limit: 50,
    });
  }

  async markNotificationRead(
    actor: HrActor,
    id: number,
  ): Promise<HrNotificationRow> {
    this.assertMember(actor);
    const existing = await this.notifications().findOne({ filter: { id } });
    if (!existing || existing.userId !== actor.userId) {
      throw new HrError(
        'NOT_FOUND',
        'HR_NOTIFICATION_NOT_FOUND',
        'No such notification.',
      );
    }
    return (
      await this.notifications().updateOne({
        filter: { id },
        values: { read: true },
      })
    ).record;
  }

  private async notify(
    userId: string | null,
    title: string,
    body: string,
    refType: string,
    refId: number,
  ): Promise<void> {
    if (!userId) return;
    await this.notifications().createOne({
      values: {
        ...createdStamp(),
        userId,
        title,
        body,
        type: refType,
        refType,
        refId,
        read: false,
      },
    });
  }

  // --- provisioning ----------------------------------------------------------

  /**
   * Idempotently creates the Permission Sets, the demo accounts, and the
   * sample data. Safe to call from startup and again from a route; a failure
   * is retried on the next call rather than cached.
   */
  async ensureProvisioned(): Promise<void> {
    if (!this.provisioning) {
      this.provisioning = this.runProvisioning().catch((error) => {
        this.provisioning = undefined;
        throw error;
      });
    }
    return this.provisioning;
  }

  private async runProvisioning(): Promise<void> {
    await this.ensurePermissionSets();
    await this.ensureSampleData();
  }

  private async ensurePermissionSets(): Promise<void> {
    for (const set of defineHrPermissionSets(this.authz)) {
      const existing = await this.authz.permissionSets.get(set.key);
      if (!existing) {
        await this.authz.permissionSets.create({
          key: set.key,
          title: set.title,
          grants: set.grants,
        });
        this.logger.info(`HR: created permission set ${set.key}`);
      }
    }
  }

  private async ensureUser(input: {
    name: string;
    email: string;
    username: string;
  }): Promise<{ id: string }> {
    const found = await this.users.list({ search: input.email, pageSize: 100 });
    const existing = found.items?.find(
      (item) => item.email?.toLowerCase() === input.email.toLowerCase(),
    );
    if (existing) {
      const id = String(existing.id);
      // The account already exists (matched by email). Keep the sign-in name the
      // caller asked for so the credential HR announces is the one that works.
      if (existing.username !== input.username) {
        try {
          await this.users.update(id, {
            username: input.username,
            name: input.name,
          });
        } catch (error) {
          this.logger.warn(
            `HR: could not set username ${input.username} on account ${id}: ${String(error)}`,
          );
        }
      }
      return { id };
    }
    const created = await this.users.create({
      name: input.name,
      email: input.email,
      username: input.username,
      password: HR_DEMO_PASSWORD,
    });
    return { id: String(created.id) };
  }

  private async assignPermissionSet(
    userId: string,
    permissionSet: string,
    managed: readonly string[],
  ): Promise<void> {
    await this.authz.permissionSets.replaceSubjectAssignments({
      subject: { type: 'user', id: userId },
      managedPermissionSets: [...managed, EMPLOYEE_SET_KEY],
      permissionSets: [permissionSet],
    });
    await this.authz.permissionSets.notifyAssignmentsChanged({
      type: 'user',
      id: userId,
    });
  }

  private async ensureSampleData(): Promise<void> {
    const departments = await this.ensureDepartments();
    const employees = await this.ensureEmployees(departments);
    await this.ensureAccounts(departments, employees);
    await this.ensureLeaveRequests(employees);
  }

  private async ensureDepartments(): Promise<Map<string, HrDepartmentRow>> {
    const seed = [
      {
        code: 'HQ',
        title: '总经办',
        sortOrder: 10,
        description: 'Executive office',
      },
      {
        code: 'HR',
        title: '人力资源部',
        sortOrder: 20,
        description: 'Human resources',
      },
      {
        code: 'RND',
        title: '研发部',
        sortOrder: 30,
        description: 'Research and development',
      },
      { code: 'SALES', title: '销售部', sortOrder: 40, description: 'Sales' },
      { code: 'FIN', title: '财务部', sortOrder: 50, description: 'Finance' },
    ];
    const result = new Map<string, HrDepartmentRow>();
    for (const entry of seed) {
      const existing = await this.departments().findOne({
        filter: { code: entry.code },
      });
      if (existing) {
        result.set(entry.code, existing);
        continue;
      }
      const created = (
        await this.departments().createOne({
          values: {
            ...createStamp(),
            title: entry.title,
            code: entry.code,
            sortOrder: entry.sortOrder,
            description: entry.description,
            active: true,
          },
        })
      ).record;
      result.set(entry.code, created);
    }
    return result;
  }

  private async ensureEmployees(
    departments: Map<string, HrDepartmentRow>,
  ): Promise<Map<string, HrEmployeeRow>> {
    const seed: Array<{
      employeeNo: string;
      name: string;
      code: string;
      position: string;
      status: string;
      email: string;
      hireDate: string;
      phone?: string;
    }> = [
      {
        employeeNo: 'E1001',
        name: '张明',
        code: 'RND',
        position: '前端工程师',
        status: 'active',
        email: 'zhangming@example.com',
        hireDate: '2024-03-04',
        phone: '13800000001',
      },
      {
        employeeNo: 'E1002',
        name: '李婷',
        code: 'RND',
        position: '后端工程师',
        status: 'active',
        email: 'liting@example.com',
        hireDate: '2024-05-20',
        phone: '13800000002',
      },
      {
        employeeNo: 'E1003',
        name: '王强',
        code: 'SALES',
        position: '销售代表',
        status: 'active',
        email: 'wangqiang@example.com',
        hireDate: '2023-09-11',
        phone: '13800000003',
      },
      {
        employeeNo: 'E1004',
        name: '赵蕾',
        code: 'HR',
        position: '人力资源专员',
        status: 'active',
        email: 'zhaolei@example.com',
        hireDate: '2022-07-01',
      },
      {
        employeeNo: 'E1005',
        name: '陈晨',
        code: 'FIN',
        position: '会计',
        status: 'active',
        email: 'chenchen@example.com',
        hireDate: '2023-01-09',
      },
      {
        employeeNo: 'E1006',
        name: '刘洋',
        code: 'RND',
        position: '测试工程师',
        status: 'onboarding',
        email: 'liuyang@example.com',
        hireDate: '2026-10-15',
      },
      {
        employeeNo: 'E1007',
        name: '孙悦',
        code: 'SALES',
        position: '销售经理',
        status: 'active',
        email: 'sunyue@example.com',
        hireDate: '2021-04-12',
      },
      {
        employeeNo: 'E1008',
        name: '周航',
        code: 'HQ',
        position: '总经理',
        status: 'active',
        email: 'zhouhang@example.com',
        hireDate: '2020-02-03',
      },
      {
        employeeNo: 'E1009',
        name: '吴敏',
        code: 'RND',
        position: '产品经理',
        status: 'onboarding',
        email: 'wumin@example.com',
        hireDate: '2026-10-20',
      },
      {
        employeeNo: 'E1010',
        name: '郑凯',
        code: 'SALES',
        position: '销售代表',
        status: 'offboarded',
        email: 'zhengkai@example.com',
        hireDate: '2022-11-11',
      },
      {
        employeeNo: 'E1011',
        name: '冯雪',
        code: 'HR',
        position: '人力资源经理',
        status: 'active',
        email: 'hr@example.com',
        hireDate: '2021-06-01',
      },
      {
        employeeNo: 'E1012',
        name: '韩磊',
        code: 'RND',
        position: '研发经理',
        status: 'active',
        email: 'manager@example.com',
        hireDate: '2021-08-16',
      },
      {
        employeeNo: 'E1013',
        name: '许静',
        code: 'RND',
        position: '前端工程师',
        status: 'active',
        email: 'employee@example.com',
        hireDate: '2024-09-02',
      },
    ];

    const result = new Map<string, HrEmployeeRow>();
    for (const entry of seed) {
      const existing = await this.employees().findOne({
        filter: { employeeNo: entry.employeeNo },
      });
      const department = departments.get(entry.code);
      if (existing) {
        result.set(entry.employeeNo, existing);
        continue;
      }
      const created = (
        await this.employees().createOne({
          values: {
            ...createStamp(),
            employeeNo: entry.employeeNo,
            name: entry.name,
            email: entry.email,
            phone: entry.phone ?? null,
            departmentId: department?.id ?? null,
            position: entry.position,
            status: entry.status,
            hireDate: entry.hireDate,
            offboardedAt:
              entry.status === 'offboarded'
                ? new Date('2026-06-30T00:00:00.000Z')
                : null,
            idNumber:
              entry.status === 'offboarded'
                ? null
                : `11010119900101${entry.employeeNo.slice(-4)}`,
            contractNo: `HT-${entry.employeeNo}`,
            contractStartDate: entry.hireDate,
            contractEndDate: '2027-12-31',
            notes: `${entry.position} · ${entry.code}`,
          },
        })
      ).record;
      result.set(entry.employeeNo, created);
    }
    return result;
  }

  private async ensureAccounts(
    departments: Map<string, HrDepartmentRow>,
    employees: Map<string, HrEmployeeRow>,
  ): Promise<void> {
    const demo: Array<{
      employeeNo: string;
      username: string;
      permissionSet: string;
      managerOf?: string;
    }> = [
      { employeeNo: 'E1011', username: 'hrlead', permissionSet: HR_SET_KEY },
      {
        employeeNo: 'E1012',
        username: 'manager',
        permissionSet: SUPERVISOR_SET_KEY,
        managerOf: 'RND',
      },
      {
        employeeNo: 'E1013',
        username: 'employee',
        permissionSet: EMPLOYEE_SET_KEY,
      },
      {
        employeeNo: 'E1007',
        username: 'sunyue',
        permissionSet: SUPERVISOR_SET_KEY,
        managerOf: 'SALES',
      },
      {
        employeeNo: 'E1001',
        username: 'zhangming',
        permissionSet: EMPLOYEE_SET_KEY,
      },
      {
        employeeNo: 'E1002',
        username: 'liting',
        permissionSet: EMPLOYEE_SET_KEY,
      },
    ];

    for (const account of demo) {
      const employee = employees.get(account.employeeNo);
      if (!employee) continue;
      const user = await this.ensureUser({
        name: employee.name,
        email: employee.email ?? `${account.username}@example.com`,
        username: account.username,
      });
      if (employee.userId !== user.id || employee.status !== 'active') {
        await this.employees().updateOne({
          filter: { id: employee.id },
          values: { ...updateStamp(), userId: user.id, status: 'active' },
        });
        // Keep the in-memory map in step: `ensureLeaveRequests` reads it next and
        // must address each seeded request to the account that now owns it.
        employee.userId = user.id;
        employee.status = 'active';
      }
      await this.assignPermissionSet(user.id, account.permissionSet, [
        HR_SET_KEY,
        SUPERVISOR_SET_KEY,
      ]);
      if (account.managerOf) {
        const department = departments.get(account.managerOf);
        if (department && department.managerId !== user.id) {
          await this.departments().updateOne({
            filter: { id: department.id },
            values: { ...updateStamp(), managerId: user.id },
          });
        }
      }
    }
  }

  private async ensureLeaveRequests(
    employees: Map<string, HrEmployeeRow>,
  ): Promise<void> {
    const existing = await this.leaveRequests().count();
    if (existing > 0) return;
    const seed: Array<{
      employeeNo: string;
      type: string;
      startDate: string;
      endDate: string;
      reason: string;
      status: string;
      approverName?: string;
      rejectionReason?: string;
    }> = [
      {
        employeeNo: 'E1013',
        type: 'annual',
        startDate: '2026-12-01',
        endDate: '2026-12-03',
        reason: '家庭事务',
        status: 'pending',
      },
      {
        employeeNo: 'E1001',
        type: 'sick',
        startDate: '2026-11-20',
        endDate: '2026-11-21',
        reason: '感冒发烧',
        status: 'rejected',
        approverName: '韩磊',
        rejectionReason: '项目交付期，请改为调休或提供医生证明后重新提交。',
      },
      {
        employeeNo: 'E1002',
        type: 'annual',
        startDate: '2026-10-01',
        endDate: '2026-10-03',
        reason: '国庆返乡',
        status: 'approved',
        approverName: '韩磊',
      },
      {
        employeeNo: 'E1003',
        type: 'personal',
        startDate: '2026-11-25',
        endDate: '2026-11-25',
        reason: '办理证件',
        status: 'pending',
      },
    ];
    for (const entry of seed) {
      const employee = employees.get(entry.employeeNo);
      if (!employee) continue;
      const decided = entry.status !== 'pending';
      const created = (
        await this.leaveRequests().createOne({
          values: {
            ...createStamp(),
            employeeId: employee.id,
            userId: employee.userId,
            departmentId: employee.departmentId,
            type: entry.type,
            startDate: entry.startDate,
            endDate: entry.endDate,
            days: inclusiveDays(entry.startDate, entry.endDate),
            reason: entry.reason,
            status: entry.status,
            approverName: entry.approverName ?? null,
            decidedAt: decided ? new Date() : null,
            rejectionReason: entry.rejectionReason ?? null,
            revision: 1,
            submittedAt: new Date(),
          },
        })
      ).record;
      if (decided && employee.userId) {
        await this.notify(
          employee.userId,
          entry.status === 'approved'
            ? 'Leave request approved'
            : 'Leave request rejected',
          entry.status === 'approved'
            ? `Your ${entry.type} leave for ${entry.startDate}–${entry.endDate} was approved.`
            : `Your ${entry.type} leave for ${entry.startDate}–${entry.endDate} was rejected: ${entry.rejectionReason}`,
          'leave-request',
          created.id,
        );
      }
    }
  }

  /** Exposed so the setup instructions can name the page ids. */
  static readonly pageIds = HR_PAGE_IDS;
}
