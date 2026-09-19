import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type QueryAdapter,
  type SelectQuery,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export type ExpenseRole = 'employee' | 'manager' | 'finance' | 'admin';

export type ExpenseStatus =
  'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';

export type ExpenseAction =
  'create' | 'update' | 'submit' | 'approve' | 'reject' | 'pay';

export interface ExpenseActor {
  readonly userId: string;
  readonly employeeId: string;
  readonly name: string;
  readonly role: ExpenseRole;
  readonly departmentId: string | null;
  readonly managerUserId: string | null;
}

export interface ExpenseItemInput {
  readonly categoryId: string;
  readonly expenseDate: string;
  readonly amount: number;
  readonly description?: string | null;
}

export interface ExpenseReportInput {
  readonly purpose?: string | null;
  readonly items: readonly ExpenseItemInput[];
}

export type ExpenseScope = 'mine' | 'approvals' | 'finance' | 'all';

export interface ExpenseListFilters {
  readonly scope?: ExpenseScope;
  readonly status?: string;
  readonly categoryId?: string;
  readonly search?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface ExpenseReportSummary {
  readonly id: string;
  readonly number: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly departmentId: string;
  readonly departmentName: string;
  readonly status: ExpenseStatus;
  readonly totalAmount: number;
  readonly purpose: string | null;
  readonly itemCount: number;
  readonly createdAt: string;
  readonly submittedAt: string | null;
  readonly decidedAt: string | null;
  readonly paidAt: string | null;
  readonly decisionComment: string | null;
}

export interface ExpenseItemView {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly expenseDate: string;
  readonly amount: number;
  readonly description: string | null;
}

export interface ExpenseActionView {
  readonly id: string;
  readonly action: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly comment: string | null;
  readonly createdAt: string;
}

export interface ExpenseCapabilities {
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canSubmit: boolean;
  readonly canApprove: boolean;
  readonly canReject: boolean;
  readonly canPay: boolean;
}

export interface ExpenseReportDetail {
  readonly report: ExpenseReportSummary;
  readonly items: readonly ExpenseItemView[];
  readonly actions: readonly ExpenseActionView[];
  readonly payment: {
    readonly amount: number;
    readonly paidAt: string;
    readonly paidBy: string;
  } | null;
  readonly capabilities: ExpenseCapabilities;
}

export interface ExpenseMeta {
  readonly actor: {
    readonly userId: string;
    readonly name: string;
    readonly role: ExpenseRole;
    readonly departmentId: string | null;
    readonly departmentName: string | null;
  };
  readonly departments: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly categories: readonly {
    readonly id: string;
    readonly name: string;
  }[];
}

export interface ExpenseCategoryStat {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly amount: number;
  readonly count: number;
}

export interface ExpenseStatistics {
  readonly totalAmount: number;
  readonly reportCount: number;
  readonly itemCount: number;
  readonly byCategory: readonly ExpenseCategoryStat[];
  readonly byStatus: readonly {
    readonly status: ExpenseStatus;
    readonly count: number;
    readonly amount: number;
  }[];
  readonly byDepartment: readonly {
    readonly departmentId: string;
    readonly departmentName: string;
    readonly count: number;
    readonly amount: number;
  }[];
}

export class ExpenseError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ExpenseError';
    this.code = code;
    this.status = status;
  }
}

export interface ExpenseListResult {
  readonly allowed: boolean;
  readonly data: readonly ExpenseReportSummary[];
  readonly total: number;
}

export interface ExpenseService {
  resolveActor(userId: string, name: string): Promise<ExpenseActor>;
  getMeta(actor: ExpenseActor): Promise<ExpenseMeta>;
  listReports(
    actor: ExpenseActor,
    filters: ExpenseListFilters,
  ): Promise<ExpenseListResult>;
  getReport(actor: ExpenseActor, id: string): Promise<ExpenseReportDetail>;
  createReport(
    actor: ExpenseActor,
    input: ExpenseReportInput,
  ): Promise<ExpenseReportDetail>;
  updateReport(
    actor: ExpenseActor,
    id: string,
    input: ExpenseReportInput,
  ): Promise<ExpenseReportDetail>;
  deleteReport(actor: ExpenseActor, id: string): Promise<void>;
  submitReport(actor: ExpenseActor, id: string): Promise<ExpenseReportDetail>;
  approveReport(
    actor: ExpenseActor,
    id: string,
    comment?: string,
  ): Promise<ExpenseReportDetail>;
  rejectReport(
    actor: ExpenseActor,
    id: string,
    comment: string,
  ): Promise<ExpenseReportDetail>;
  payReport(actor: ExpenseActor, id: string): Promise<ExpenseReportDetail>;
  getStatistics(
    actor: ExpenseActor,
    filters: ExpenseListFilters,
  ): Promise<ExpenseStatistics>;
}

export const expenseServiceToken: ServiceToken<ExpenseService> =
  createServiceToken<ExpenseService>('app/expense-service');

type EmployeeRow = {
  id: string;
  userId: string;
  name: string;
  role: string;
  departmentId: string | null;
  managerUserId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  sort: number;
};

type CategoryRow = {
  id: string;
  code: string;
  name: string;
  sort: number;
};

type ReportRow = {
  id: string;
  number: string;
  employeeId: string;
  departmentId: string;
  status: string;
  totalAmount: number | string;
  purpose: string | null;
  submittedAt: Date | string | null;
  decidedAt: Date | string | null;
  paidAt: Date | string | null;
  decidedBy: string | null;
  decisionComment: string | null;
  paidBy: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ItemRow = {
  id: string;
  reportId: string;
  categoryId: string;
  expenseDate: Date | string;
  amount: number | string;
  description: string | null;
  createdAt: Date | string;
};

type ActionRow = {
  id: string;
  reportId: string;
  action: string;
  actorId: string;
  actorName: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  createdAt: Date | string;
};

type PaymentRow = {
  id: string;
  reportId: string;
  amount: number | string;
  paidBy: string;
  paidAt: Date | string;
};

const WRITE_ROLES: readonly ExpenseRole[] = ['employee', 'manager', 'admin'];
const STATISTICS_STATUSES: readonly ExpenseStatus[] = [
  'submitted',
  'approved',
  'paid',
];
const FINANCE_STATUSES: readonly ExpenseStatus[] = ['approved', 'paid'];

export default class ExpenseProvider extends ServiceProvider<Application> {
  public readonly name = 'app/expense-provider';

  public override register(): void {
    this.app.container.singleton(expenseServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createExpenseService(database);
    });
  }
}

export function createExpenseService(
  database: DatabaseManager,
): ExpenseService {
  return new DefaultExpenseService(database);
}

class DefaultExpenseService implements ExpenseService {
  constructor(private readonly database: DatabaseManager) {}

  public async resolveActor(
    userId: string,
    name: string,
  ): Promise<ExpenseActor> {
    const query = this.database.query();
    const existing = await query
      .selectFrom<EmployeeRow>('expenseEmployees')
      .selectAll()
      .where('userId', '=', userId)
      .executeTakeFirst<EmployeeRow>();
    if (existing) return toActor(existing);

    const department = await query
      .selectFrom<DepartmentRow>('expenseDepartments')
      .selectAll()
      .orderBy('sort', 'asc')
      .limit(1)
      .executeTakeFirst<DepartmentRow>();
    const managerUserId = department
      ? await this.findManagerUserId(department.id)
      : null;
    const now = new Date();
    try {
      await query
        .insertInto<EmployeeRow>('expenseEmployees')
        .values({
          id: crypto.randomUUID(),
          userId,
          name: name.trim() || userId,
          role: 'employee',
          departmentId: department?.id ?? null,
          managerUserId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    } catch {
      // Another request provisioned the same user first; fall through to the re-read below.
    }
    const created = await query
      .selectFrom<EmployeeRow>('expenseEmployees')
      .selectAll()
      .where('userId', '=', userId)
      .executeTakeFirst<EmployeeRow>();
    if (!created) {
      throw new ExpenseError(
        'EMPLOYEE_NOT_FOUND',
        'Unable to provision an employee profile.',
        500,
      );
    }
    return toActor(created);
  }

  public async getMeta(actor: ExpenseActor): Promise<ExpenseMeta> {
    const query = this.database.query();
    const [departments, categories, department] = await Promise.all([
      query
        .selectFrom<DepartmentRow>('expenseDepartments')
        .selectAll()
        .orderBy('sort', 'asc')
        .execute<DepartmentRow>(),
      query
        .selectFrom<CategoryRow>('expenseCategories')
        .selectAll()
        .orderBy('sort', 'asc')
        .execute<CategoryRow>(),
      actor.departmentId
        ? query
            .selectFrom<DepartmentRow>('expenseDepartments')
            .selectAll()
            .where('id', '=', actor.departmentId)
            .executeTakeFirst<DepartmentRow>()
        : Promise.resolve(undefined),
    ]);
    return {
      actor: {
        userId: actor.userId,
        name: actor.name,
        role: actor.role,
        departmentId: actor.departmentId,
        departmentName: department?.name ?? null,
      },
      departments: departments.map((row) => ({ id: row.id, name: row.name })),
      categories: categories.map((row) => ({ id: row.id, name: row.name })),
    };
  }

  public async listReports(
    actor: ExpenseActor,
    filters: ExpenseListFilters,
  ): Promise<ExpenseListResult> {
    const scope = filters.scope ?? 'mine';
    if (!scopeAllowed(scope, actor.role)) {
      return { allowed: false, data: [], total: 0 };
    }
    const reports = await this.queryReports(actor, scope, filters);
    const [employees, departments, itemCounts] = await Promise.all([
      this.employeeMap(),
      this.departmentMap(),
      this.itemCountMap(reports.map((row) => row.id)),
    ]);
    const data = reports.map((row) =>
      toSummary(
        row,
        employees.get(row.employeeId),
        departments.get(row.departmentId),
        itemCounts.get(row.id) ?? 0,
      ),
    );
    return { allowed: true, data, total: data.length };
  }

  public async getReport(
    actor: ExpenseActor,
    id: string,
  ): Promise<ExpenseReportDetail> {
    const report = await this.loadReport(id);
    if (!visibleTo(actor, report)) {
      throw new ExpenseError('FORBIDDEN', 'You cannot view this report.', 403);
    }
    return this.buildDetail(actor, report);
  }

  public async createReport(
    actor: ExpenseActor,
    input: ExpenseReportInput,
  ): Promise<ExpenseReportDetail> {
    assertRole(actor, WRITE_ROLES, 'create a reimbursement');
    const items = normalizeItems(input.items);
    const departmentId = await this.requireDepartment(actor);
    const now = new Date();
    const id = crypto.randomUUID();
    const number = await this.nextNumber();
    const totalAmount = roundMoney(
      items.reduce((sum, item) => sum + item.amount, 0),
    );
    const purpose = normalizeText(input.purpose);

    await this.database.transaction(async (connection) => {
      await connection.query
        .insertInto<ReportRow>('expenseReports')
        .values({
          id,
          number,
          employeeId: actor.employeeId,
          departmentId,
          status: 'draft',
          totalAmount,
          purpose,
          submittedAt: null,
          decidedAt: null,
          paidAt: null,
          decidedBy: null,
          decisionComment: null,
          paidBy: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await this.insertItems(connection.query, id, items, now);
      await connection.query
        .insertInto<ActionRow>('expenseActions')
        .values({
          id: crypto.randomUUID(),
          reportId: id,
          action: 'create',
          actorId: actor.userId,
          actorName: actor.name,
          fromStatus: null,
          toStatus: 'draft',
          comment: null,
          createdAt: now,
        })
        .execute();
    });

    return this.getReport(actor, id);
  }

  public async updateReport(
    actor: ExpenseActor,
    id: string,
    input: ExpenseReportInput,
  ): Promise<ExpenseReportDetail> {
    const report = await this.loadReport(id);
    this.assertOwner(actor, report);
    if (report.status !== 'draft') {
      throw new ExpenseError(
        'INVALID_STATE',
        'Only a draft reimbursement can be edited.',
        409,
      );
    }
    const items = normalizeItems(input.items);
    const totalAmount = roundMoney(
      items.reduce((sum, item) => sum + item.amount, 0),
    );
    const now = new Date();

    await this.database.transaction(async (connection) => {
      await connection.query
        .updateTable<ReportRow>('expenseReports')
        .set({
          purpose: normalizeText(input.purpose),
          totalAmount,
          updatedAt: now,
        })
        .where('id', '=', id)
        .where('status', '=', 'draft')
        .execute();
      await connection.query
        .deleteFrom<ItemRow>('expenseItems')
        .where('reportId', '=', id)
        .execute();
      await this.insertItems(connection.query, id, items, now);
    });

    return this.getReport(actor, id);
  }

  public async deleteReport(actor: ExpenseActor, id: string): Promise<void> {
    const report = await this.loadReport(id);
    this.assertOwner(actor, report);
    if (report.status !== 'draft') {
      throw new ExpenseError(
        'INVALID_STATE',
        'Only a draft reimbursement can be deleted.',
        409,
      );
    }
    await this.database.transaction(async (connection) => {
      await connection.query
        .deleteFrom<ItemRow>('expenseItems')
        .where('reportId', '=', id)
        .execute();
      await connection.query
        .deleteFrom<ActionRow>('expenseActions')
        .where('reportId', '=', id)
        .execute();
      await connection.query
        .deleteFrom<ReportRow>('expenseReports')
        .where('id', '=', id)
        .execute();
    });
  }

  public async submitReport(
    actor: ExpenseActor,
    id: string,
  ): Promise<ExpenseReportDetail> {
    const report = await this.loadReport(id);
    this.assertOwner(actor, report);
    if (report.status !== 'draft') {
      throw new ExpenseError(
        'INVALID_STATE',
        'Only a draft reimbursement can be submitted.',
        409,
      );
    }
    const items = await this.loadItems([id]);
    if (items.length === 0) {
      throw new ExpenseError(
        'EMPTY_REPORT',
        'Add at least one expense item before submitting.',
        400,
      );
    }
    const owner = await this.database
      .query()
      .selectFrom<EmployeeRow>('expenseEmployees')
      .selectAll()
      .where('id', '=', report.employeeId)
      .executeTakeFirst<EmployeeRow>();
    if (!owner?.managerUserId) {
      throw new ExpenseError(
        'NO_MANAGER',
        'No direct manager is configured for this employee.',
        409,
      );
    }
    await this.transition(actor, report, 'submitted', 'submit', null);
    return this.getReport(actor, id);
  }

  public async approveReport(
    actor: ExpenseActor,
    id: string,
    comment?: string,
  ): Promise<ExpenseReportDetail> {
    const report = await this.loadReport(id);
    this.assertApprover(actor, report);
    if (report.status !== 'submitted') {
      throw new ExpenseError(
        'INVALID_STATE',
        'Only a submitted reimbursement can be approved.',
        409,
      );
    }
    await this.transition(
      actor,
      report,
      'approved',
      'approve',
      normalizeText(comment),
    );
    return this.getReport(actor, id);
  }

  public async rejectReport(
    actor: ExpenseActor,
    id: string,
    comment: string,
  ): Promise<ExpenseReportDetail> {
    const report = await this.loadReport(id);
    this.assertApprover(actor, report);
    if (report.status !== 'submitted') {
      throw new ExpenseError(
        'INVALID_STATE',
        'Only a submitted reimbursement can be returned.',
        409,
      );
    }
    const reason = normalizeText(comment);
    if (!reason) {
      throw new ExpenseError(
        'REASON_REQUIRED',
        'A reason is required when returning a reimbursement.',
        400,
      );
    }
    await this.transition(actor, report, 'rejected', 'reject', reason);
    return this.getReport(actor, id);
  }

  public async payReport(
    actor: ExpenseActor,
    id: string,
  ): Promise<ExpenseReportDetail> {
    if (actor.role !== 'finance' && actor.role !== 'admin') {
      throw new ExpenseError(
        'FORBIDDEN',
        'Only the finance team can record a payment.',
        403,
      );
    }
    const now = new Date();
    await this.database.transaction(async (connection) => {
      const current = await connection.query
        .selectFrom<ReportRow>('expenseReports')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<ReportRow>();
      if (!current) {
        throw new ExpenseError('NOT_FOUND', 'Reimbursement not found.', 404);
      }
      if (current.status === 'paid') {
        throw new ExpenseError(
          'ALREADY_PAID',
          'This reimbursement has already been paid.',
          409,
        );
      }
      if (current.status !== 'approved') {
        throw new ExpenseError(
          'NOT_APPROVED',
          'Only an approved reimbursement can be paid.',
          409,
        );
      }
      try {
        // The unique report id makes this ledger row the database-level guard against a duplicate payment.
        await connection.query
          .insertInto<PaymentRow>('expensePayments')
          .values({
            id: crypto.randomUUID(),
            reportId: id,
            amount: current.totalAmount,
            paidBy: actor.userId,
            paidAt: now,
            createdAt: now,
          } as PaymentRow)
          .execute();
      } catch {
        throw new ExpenseError(
          'ALREADY_PAID',
          'This reimbursement has already been paid.',
          409,
        );
      }
      await connection.query
        .updateTable<ReportRow>('expenseReports')
        .set({
          status: 'paid',
          paidAt: now,
          paidBy: actor.userId,
          updatedAt: now,
        })
        .where('id', '=', id)
        .execute();
      await connection.query
        .insertInto<ActionRow>('expenseActions')
        .values({
          id: crypto.randomUUID(),
          reportId: id,
          action: 'pay',
          actorId: actor.userId,
          actorName: actor.name,
          fromStatus: 'approved',
          toStatus: 'paid',
          comment: null,
          createdAt: now,
        })
        .execute();
    });
    return this.getReport(actor, id);
  }

  public async getStatistics(
    actor: ExpenseActor,
    filters: ExpenseListFilters,
  ): Promise<ExpenseStatistics> {
    const records = await this.queryReports(actor, 'all', filters, {
      statuses: STATISTICS_STATUSES,
    });
    const items = await this.loadItems(records.map((row) => row.id));
    const categories = await this.categoryMap();
    const departments = await this.departmentMap();

    const categoryTotals = new Map<string, { amount: number; count: number }>();
    for (const item of items) {
      const bucket = categoryTotals.get(item.categoryId) ?? {
        amount: 0,
        count: 0,
      };
      bucket.amount += Number(item.amount);
      bucket.count += 1;
      categoryTotals.set(item.categoryId, bucket);
    }
    const byCategory = [...categoryTotals.entries()]
      .map(([categoryId, bucket]) => ({
        categoryId,
        categoryName: categories.get(categoryId)?.name ?? categoryId,
        amount: roundMoney(bucket.amount),
        count: bucket.count,
      }))
      .sort((left, right) => right.amount - left.amount);

    const statusTotals = new Map<string, { count: number; amount: number }>();
    for (const record of records) {
      const bucket = statusTotals.get(record.status) ?? { count: 0, amount: 0 };
      bucket.count += 1;
      bucket.amount += Number(record.totalAmount);
      statusTotals.set(record.status, bucket);
    }
    const byStatus = [...statusTotals.entries()].map(([status, bucket]) => ({
      status: status as ExpenseStatus,
      count: bucket.count,
      amount: roundMoney(bucket.amount),
    }));

    const departmentTotals = new Map<
      string,
      { count: number; amount: number }
    >();
    for (const record of records) {
      const bucket = departmentTotals.get(record.departmentId) ?? {
        count: 0,
        amount: 0,
      };
      bucket.count += 1;
      bucket.amount += Number(record.totalAmount);
      departmentTotals.set(record.departmentId, bucket);
    }
    const byDepartment = [...departmentTotals.entries()].map(
      ([departmentId, bucket]) => ({
        departmentId,
        departmentName: departments.get(departmentId)?.name ?? departmentId,
        count: bucket.count,
        amount: roundMoney(bucket.amount),
      }),
    );

    return {
      totalAmount: roundMoney(
        records.reduce((sum, row) => sum + Number(row.totalAmount), 0),
      ),
      reportCount: records.length,
      itemCount: items.length,
      byCategory,
      byStatus,
      byDepartment,
    };
  }

  private async buildDetail(
    actor: ExpenseActor,
    report: ReportRow,
  ): Promise<ExpenseReportDetail> {
    const query = this.database.query();
    const [items, actions, payment, employees, departments, categories] =
      await Promise.all([
        query
          .selectFrom<ItemRow>('expenseItems')
          .selectAll()
          .where('reportId', '=', report.id)
          .orderBy('expenseDate', 'asc')
          .execute<ItemRow>(),
        query
          .selectFrom<ActionRow>('expenseActions')
          .selectAll()
          .where('reportId', '=', report.id)
          .orderBy('createdAt', 'asc')
          .execute<ActionRow>(),
        query
          .selectFrom<PaymentRow>('expensePayments')
          .selectAll()
          .where('reportId', '=', report.id)
          .executeTakeFirst<PaymentRow>(),
        this.employeeMap(),
        this.departmentMap(),
        this.categoryMap(),
      ]);

    const summary = toSummary(
      report,
      employees.get(report.employeeId),
      departments.get(report.departmentId),
      items.length,
    );

    return {
      report: summary,
      items: items.map((item) => ({
        id: item.id,
        categoryId: item.categoryId,
        categoryName: categories.get(item.categoryId)?.name ?? item.categoryId,
        expenseDate: isoDate(item.expenseDate),
        amount: roundMoney(Number(item.amount)),
        description: item.description,
      })),
      actions: actions.map((action) => ({
        id: action.id,
        action: action.action,
        actorId: action.actorId,
        actorName: action.actorName ?? action.actorId,
        fromStatus: action.fromStatus,
        toStatus: action.toStatus,
        comment: action.comment,
        createdAt: isoDateTime(action.createdAt),
      })),
      payment: payment
        ? {
            amount: roundMoney(Number(payment.amount)),
            paidAt: isoDateTime(payment.paidAt),
            paidBy: payment.paidBy,
          }
        : null,
      capabilities: capabilitiesFor(actor, report),
    };
  }

  private async queryReports(
    actor: ExpenseActor,
    scope: ExpenseScope,
    filters: ExpenseListFilters,
    options: { readonly statuses?: readonly ExpenseStatus[] } = {},
  ): Promise<ReportRow[]> {
    const query = this.database.query();
    let builder: SelectQuery<ReportRow> =
      query.selectFrom<ReportRow>('expenseReports');

    if (scope === 'mine') {
      if (actor.role !== 'admin') {
        builder = builder.where('employeeId', '=', actor.employeeId);
      }
    } else if (scope === 'all') {
      builder = this.applyNonAdminScope(builder, actor);
    } else if (scope === 'approvals') {
      if (actor.role === 'admin') {
        // The administrator has no department, so the departmental filter would
        // always match nothing. Keep the administrator's view consistent with
        // "my reimbursements" and finance, where the administrator sees everything.
        builder = builder.where('status', '=', 'submitted');
      } else {
        builder = builder
          .where('departmentId', '=', actor.departmentId ?? '')
          .where('employeeId', '!=', actor.employeeId);
      }
    }

    const statuses = options.statuses;
    if (statuses && statuses.length > 0) {
      builder = builder.where('status', 'in', statuses);
    } else if (scope === 'approvals') {
      builder = builder.where('status', '=', 'submitted');
    } else if (scope === 'finance') {
      builder = builder.where('status', 'in', FINANCE_STATUSES);
    }
    if (filters.status && filters.status !== 'all') {
      builder = builder.where('status', '=', filters.status);
    }

    const search = normalizeText(filters.search);
    if (search) {
      const pattern = `%${search}%`;
      const employeeIds = await this.database
        .query()
        .selectFrom<EmployeeRow>('expenseEmployees')
        .select('id')
        .where('name', 'like', pattern)
        .pluck<string>('id');
      builder = builder.where((eb) =>
        eb.or([
          eb('number', 'like', pattern),
          eb('purpose', 'like', pattern),
          ...(employeeIds.length > 0
            ? [eb('employeeId', 'in', employeeIds)]
            : []),
        ]),
      );
    }

    if (filters.categoryId) {
      const reportIds = await this.database
        .query()
        .selectFrom<ItemRow>('expenseItems')
        .select('reportId')
        .where('categoryId', '=', filters.categoryId)
        .pluck<string>('reportId');
      builder = builder.where(
        'id',
        'in',
        reportIds.length > 0 ? [...new Set(reportIds)] : ['__none__'],
      );
    }

    if (filters.from) {
      builder = builder.where('createdAt', '>=', new Date(filters.from));
    }
    if (filters.to) {
      builder = builder.where('createdAt', '<=', endOfDay(filters.to));
    }

    return builder.orderBy('createdAt', 'desc').execute<ReportRow>();
  }

  private applyNonAdminScope(
    builder: SelectQuery<ReportRow>,
    actor: ExpenseActor,
  ): SelectQuery<ReportRow> {
    if (actor.role === 'admin') {
      // The administrator has no employee row tied to the reports, so filtering by
      // employeeId would return an empty statistics view. The administrator sees all.
      return builder;
    }
    if (actor.role === 'manager' && actor.departmentId) {
      return builder.where('departmentId', '=', actor.departmentId);
    }
    if (actor.role === 'finance') {
      return builder.where('status', 'in', FINANCE_STATUSES);
    }
    return builder.where('employeeId', '=', actor.employeeId);
  }

  private async transition(
    actor: ExpenseActor,
    report: ReportRow,
    toStatus: ExpenseStatus,
    action: ExpenseAction,
    comment: string | null,
  ): Promise<void> {
    const now = new Date();
    const isDecision = toStatus === 'approved' || toStatus === 'rejected';
    await this.database.transaction(async (connection) => {
      await connection.query
        .updateTable<ReportRow>('expenseReports')
        .set({
          status: toStatus,
          updatedAt: now,
          ...(toStatus === 'submitted' ? { submittedAt: now } : {}),
          ...(isDecision
            ? {
                decidedAt: now,
                decidedBy: actor.userId,
                decisionComment: comment,
              }
            : {}),
        })
        .where('id', '=', report.id)
        .where('status', '=', report.status)
        .execute();
      await connection.query
        .insertInto<ActionRow>('expenseActions')
        .values({
          id: crypto.randomUUID(),
          reportId: report.id,
          action,
          actorId: actor.userId,
          actorName: actor.name,
          fromStatus: report.status,
          toStatus,
          comment,
          createdAt: now,
        })
        .execute();
    });
  }

  private async insertItems(
    query: QueryAdapter,
    reportId: string,
    items: readonly NormalizedItem[],
    now: Date,
  ): Promise<void> {
    for (const item of items) {
      await query
        .insertInto<ItemRow>('expenseItems')
        .values({
          id: crypto.randomUUID(),
          reportId,
          categoryId: item.categoryId,
          expenseDate: item.expenseDate,
          amount: item.amount,
          description: item.description,
          createdAt: now,
        })
        .execute();
    }
  }

  private async loadReport(id: string): Promise<ReportRow> {
    const report = await this.database
      .query()
      .selectFrom<ReportRow>('expenseReports')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<ReportRow>();
    if (!report) {
      throw new ExpenseError('NOT_FOUND', 'Reimbursement not found.', 404);
    }
    return report;
  }

  private async loadItems(reportIds: readonly string[]): Promise<ItemRow[]> {
    if (reportIds.length === 0) return [];
    return this.database
      .query()
      .selectFrom<ItemRow>('expenseItems')
      .selectAll()
      .where('reportId', 'in', reportIds)
      .execute<ItemRow>();
  }

  private async itemCountMap(
    reportIds: readonly string[],
  ): Promise<Map<string, number>> {
    const items = await this.loadItems(reportIds);
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.reportId, (counts.get(item.reportId) ?? 0) + 1);
    }
    return counts;
  }

  private async employeeMap(): Promise<Map<string, EmployeeRow>> {
    const rows = await this.database
      .query()
      .selectFrom<EmployeeRow>('expenseEmployees')
      .selectAll()
      .execute<EmployeeRow>();
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async departmentMap(): Promise<Map<string, DepartmentRow>> {
    const rows = await this.database
      .query()
      .selectFrom<DepartmentRow>('expenseDepartments')
      .selectAll()
      .execute<DepartmentRow>();
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async categoryMap(): Promise<Map<string, CategoryRow>> {
    const rows = await this.database
      .query()
      .selectFrom<CategoryRow>('expenseCategories')
      .selectAll()
      .execute<CategoryRow>();
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async findManagerUserId(
    departmentId: string,
  ): Promise<string | null> {
    const manager = await this.database
      .query()
      .selectFrom<EmployeeRow>('expenseEmployees')
      .selectAll()
      .where('departmentId', '=', departmentId)
      .where('role', '=', 'manager')
      .executeTakeFirst<EmployeeRow>();
    return manager?.userId ?? null;
  }

  private async requireDepartment(actor: ExpenseActor): Promise<string> {
    if (actor.departmentId) return actor.departmentId;
    const department = await this.database
      .query()
      .selectFrom<DepartmentRow>('expenseDepartments')
      .selectAll()
      .orderBy('sort', 'asc')
      .limit(1)
      .executeTakeFirst<DepartmentRow>();
    if (!department) {
      throw new ExpenseError(
        'NO_DEPARTMENT',
        'No department is configured.',
        409,
      );
    }
    return department.id;
  }

  private async nextNumber(): Promise<string> {
    const now = new Date();
    const prefix = `EXP-${now.getFullYear()}${String(
      now.getMonth() + 1,
    ).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const existing = await this.database
      .query()
      .selectFrom<ReportRow>('expenseReports')
      .select('id')
      .where('number', 'like', `${prefix}-%`)
      .pluck<string>('id');
    return `${prefix}-${String(existing.length + 1).padStart(4, '0')}`;
  }

  private assertOwner(actor: ExpenseActor, report: ReportRow): void {
    if (actor.role === 'admin') return;
    if (report.employeeId !== actor.employeeId) {
      throw new ExpenseError(
        'FORBIDDEN',
        'You can only manage your own reimbursements.',
        403,
      );
    }
  }

  private assertApprover(actor: ExpenseActor, report: ReportRow): void {
    if (actor.role !== 'manager' && actor.role !== 'admin') {
      throw new ExpenseError(
        'FORBIDDEN',
        'Only a manager can review a reimbursement.',
        403,
      );
    }
    if (report.employeeId === actor.employeeId) {
      throw new ExpenseError(
        'SELF_APPROVAL_FORBIDDEN',
        'You cannot approve your own reimbursement.',
        403,
      );
    }
    if (
      actor.role === 'manager' &&
      (!actor.departmentId || report.departmentId !== actor.departmentId)
    ) {
      throw new ExpenseError(
        'FORBIDDEN',
        'You can only review reimbursements from your department.',
        403,
      );
    }
  }
}

interface NormalizedItem {
  readonly categoryId: string;
  readonly expenseDate: Date;
  readonly amount: number;
  readonly description: string | null;
}

function scopeAllowed(scope: ExpenseScope, role: ExpenseRole): boolean {
  if (role === 'admin') return true;
  if (scope === 'approvals') return role === 'manager';
  if (scope === 'finance') return role === 'finance';
  if (scope === 'all') return false;
  return true;
}

function visibleTo(actor: ExpenseActor, report: ReportRow): boolean {
  if (actor.role === 'admin') return true;
  if (report.employeeId === actor.employeeId) return true;
  if (actor.role === 'finance') {
    return FINANCE_STATUSES.includes(report.status as ExpenseStatus);
  }
  if (actor.role === 'manager') {
    return (
      report.departmentId === actor.departmentId && report.status !== 'draft'
    );
  }
  return false;
}

function capabilitiesFor(
  actor: ExpenseActor,
  report: ReportRow,
): ExpenseCapabilities {
  const isOwner = report.employeeId === actor.employeeId;
  const canManage = isOwner || actor.role === 'admin';
  const isDraft = report.status === 'draft';
  const isSubmitted = report.status === 'submitted';
  const isApproved = report.status === 'approved';
  const isReviewer = actor.role === 'manager' || actor.role === 'admin';
  const isFinance = actor.role === 'finance' || actor.role === 'admin';
  const canReview =
    isReviewer &&
    isSubmitted &&
    !isOwner &&
    (actor.role === 'admin' || report.departmentId === actor.departmentId);
  return {
    canEdit: canManage && isDraft,
    canDelete: canManage && isDraft,
    canSubmit: canManage && isDraft,
    canApprove: canReview,
    canReject: canReview,
    canPay: isFinance && isApproved,
  };
}

function toActor(row: EmployeeRow): ExpenseActor {
  const role = isExpenseRole(row.role) ? row.role : 'employee';
  return {
    userId: row.userId,
    employeeId: row.id,
    name: row.name,
    role,
    departmentId: row.departmentId,
    managerUserId: row.managerUserId,
  };
}

function toSummary(
  report: ReportRow,
  employee: EmployeeRow | undefined,
  department: DepartmentRow | undefined,
  itemCount: number,
): ExpenseReportSummary {
  return {
    id: report.id,
    number: report.number,
    employeeId: report.employeeId,
    employeeName: employee?.name ?? report.employeeId,
    departmentId: report.departmentId,
    departmentName: department?.name ?? report.departmentId,
    status: report.status as ExpenseStatus,
    totalAmount: roundMoney(Number(report.totalAmount)),
    purpose: report.purpose,
    itemCount,
    createdAt: isoDateTime(report.createdAt),
    submittedAt: isoDateTimeOrNull(report.submittedAt),
    decidedAt: isoDateTimeOrNull(report.decidedAt),
    paidAt: isoDateTimeOrNull(report.paidAt),
    decisionComment: report.decisionComment,
  };
}

function assertRole(
  actor: ExpenseActor,
  roles: readonly ExpenseRole[],
  action: string,
): void {
  if (!roles.includes(actor.role)) {
    throw new ExpenseError(
      'FORBIDDEN',
      `Your role is not allowed to ${action}.`,
      403,
    );
  }
}

function normalizeItems(
  items: readonly ExpenseItemInput[],
): readonly NormalizedItem[] {
  if (items.length === 0) {
    throw new ExpenseError(
      'ITEMS_REQUIRED',
      'At least one expense item is required.',
      400,
    );
  }
  return items.map((item) => {
    const categoryId = normalizeText(item.categoryId);
    if (!categoryId) {
      throw new ExpenseError(
        'CATEGORY_REQUIRED',
        'Every expense item needs a category.',
        400,
      );
    }
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ExpenseError(
        'INVALID_AMOUNT',
        'Every expense item needs a positive amount.',
        400,
      );
    }
    const expenseDate = new Date(item.expenseDate);
    if (Number.isNaN(expenseDate.getTime())) {
      throw new ExpenseError(
        'INVALID_DATE',
        'Every expense item needs a valid date.',
        400,
      );
    }
    return {
      categoryId,
      expenseDate,
      amount: roundMoney(amount),
      description: normalizeText(item.description),
    };
  });
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isExpenseRole(value: string): value is ExpenseRole {
  return (
    value === 'employee' ||
    value === 'manager' ||
    value === 'finance' ||
    value === 'admin'
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isoDateTime(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function isoDateTimeOrNull(value: Date | string | null): string | null {
  return value === null ? null : isoDateTime(value);
}

function isoDate(value: Date | string): string {
  return isoDateTime(value).slice(0, 10);
}

function endOfDay(value: string): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}
