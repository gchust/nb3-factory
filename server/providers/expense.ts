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
  readonly id?: string | null;
  readonly categoryId: string;
  readonly expenseDate: string;
  readonly amount: number;
  readonly description?: string | null;
}

export interface ExpenseReportInput {
  readonly purpose?: string | null;
  readonly items: readonly ExpenseItemInput[];
}

/**
 * The logical collection that holds File Repository metadata, the route the
 * content bytes are served from, and the disk uploaded objects are stored on.
 * Shared by the provider and the file routes so the two never drift apart.
 */
export const EXPENSE_FILE_COLLECTION = 'expenseFiles';
export const EXPENSE_FILE_ACCESS_PATH = '/expense-files';
export const EXPENSE_FILE_DISK = 'local';

export interface ExpenseFileView {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly contentUrl: string;
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
  readonly fileCount: number;
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
  readonly files: readonly ExpenseFileView[];
}

export interface ExpenseActionView {
  readonly id: string;
  readonly action: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly comment: string | null;
  /** The submission this action opened or decided, when it belongs to one. */
  readonly revision: number | null;
  readonly createdAt: string;
}

export interface ExpenseRevisionItemView {
  readonly id: string;
  readonly itemId: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly expenseDate: string;
  readonly amount: number;
  readonly description: string | null;
  readonly files: readonly ExpenseFileView[];
}

/**
 * A frozen snapshot of one submission. The receipts and items here never move,
 * so the decision recorded on this revision keeps referring to exactly the
 * material that was reviewed even after the employee replaces them.
 */
export interface ExpenseRevisionView {
  readonly id: string;
  readonly revision: number;
  readonly status: ExpenseStatus;
  readonly decision: 'approved' | 'rejected' | null;
  readonly comment: string | null;
  readonly decidedBy: string | null;
  readonly decidedByName: string | null;
  readonly submittedAt: string;
  readonly decidedAt: string | null;
  readonly items: readonly ExpenseRevisionItemView[];
  /** Report-level supporting documents frozen with this submission. */
  readonly files: readonly ExpenseFileView[];
  readonly fileCount: number;
}

export interface ExpenseCapabilities {
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canSubmit: boolean;
  readonly canApprove: boolean;
  readonly canReject: boolean;
  readonly canPay: boolean;
  /** The owner may add or remove receipts/supporting documents only before a decision. */
  readonly canManageFiles: boolean;
}

export interface ExpenseReportDetail {
  readonly report: ExpenseReportSummary;
  readonly items: readonly ExpenseItemView[];
  /** Report-level supporting documents (travel proof and the like), separate from item receipts. */
  readonly files: readonly ExpenseFileView[];
  readonly actions: readonly ExpenseActionView[];
  /**
   * Frozen snapshot per submission, oldest first. The latest revision mirrors
   * the current material while the report is editable; earlier revisions keep
   * the receipts a returned decision was based on.
   */
  readonly revisions: readonly ExpenseRevisionView[];
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
  linkItemFile(
    actor: ExpenseActor,
    reportId: string,
    itemId: string,
    fileId: string,
  ): Promise<ExpenseReportDetail>;
  linkReportFile(
    actor: ExpenseActor,
    reportId: string,
    fileId: string,
  ): Promise<ExpenseReportDetail>;
  removeFile(actor: ExpenseActor, fileId: string): Promise<void>;
  canAccessFile(actor: ExpenseActor, fileId: string): Promise<boolean>;
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
  revision: number | null;
  createdAt: Date | string;
};

type PaymentRow = {
  id: string;
  reportId: string;
  amount: number | string;
  paidBy: string;
  paidAt: Date | string;
};

type FileRow = {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | string;
  ownerId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ItemFileRow = {
  id: string;
  reportId: string;
  itemId: string;
  fileId: string;
  createdAt: Date | string;
};

type ReportFileRow = {
  id: string;
  reportId: string;
  fileId: string;
  kind: string;
  createdAt: Date | string;
};

type RevisionRow = {
  id: string;
  reportId: string;
  revision: number;
  status: string;
  decision: string | null;
  comment: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  submittedAt: Date | string;
  decidedAt: Date | string | null;
  createdAt: Date | string;
};

type RevisionItemRow = {
  id: string;
  revisionId: string;
  reportId: string;
  itemId: string;
  categoryId: string;
  categoryName: string;
  expenseDate: Date | string;
  amount: number | string;
  description: string | null;
  createdAt: Date | string;
};

type RevisionFileRow = {
  id: string;
  revisionId: string;
  reportId: string;
  itemId: string | null;
  fileId: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | string;
  kind: string;
  createdAt: Date | string;
};

/** A file frozen into a revision. `itemId` is null for a report-level supplement. */
interface RevisionSnapshotFile {
  readonly itemId: string | null;
  readonly fileId: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly kind: string;
}

/** Data captured at submit time to make one revision immutable. */
interface RevisionSnapshot {
  readonly revision: number;
  readonly items: readonly {
    readonly itemId: string;
    readonly categoryId: string;
    readonly categoryName: string;
    readonly expenseDate: Date;
    readonly amount: number;
    readonly description: string | null;
  }[];
  readonly files: readonly RevisionSnapshotFile[];
}

type FileLink =
  | {
      readonly type: 'item';
      readonly linkId: string;
      readonly reportId: string;
      readonly itemId: string;
    }
  | {
      readonly type: 'report';
      readonly linkId: string;
      readonly reportId: string;
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
      return createExpenseService(database, {
        publicBasePath: this.app.publicBasePath,
      });
    });
  }
}

export function createExpenseService(
  database: DatabaseManager,
  options: { readonly publicBasePath?: string } = {},
): ExpenseService {
  return new DefaultExpenseService(database, options.publicBasePath ?? '');
}

class DefaultExpenseService implements ExpenseService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly publicBasePath: string = '',
  ) {}

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
    const reportIds = reports.map((row) => row.id);
    const [employees, departments, itemCounts, fileCounts] = await Promise.all([
      this.employeeMap(),
      this.departmentMap(),
      this.itemCountMap(reportIds),
      this.fileCountMap(reportIds),
    ]);
    const data = reports.map((row) =>
      toSummary(
        row,
        employees.get(row.employeeId),
        departments.get(row.departmentId),
        itemCounts.get(row.id) ?? 0,
        fileCounts.get(row.id) ?? 0,
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
          revision: null,
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
    if (report.status !== 'draft' && report.status !== 'rejected') {
      throw new ExpenseError(
        'INVALID_STATE',
        'Only a draft or returned reimbursement can be edited.',
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
        .where('status', 'in', ['draft', 'rejected'])
        .execute();

      // Update the items that were kept in place so their receipt links survive,
      // and only create rows for genuinely new items.
      const existing = await connection.query
        .selectFrom<ItemRow>('expenseItems')
        .selectAll()
        .where('reportId', '=', id)
        .execute<ItemRow>();
      const existingIds = new Set(existing.map((row) => row.id));
      const keptIds = new Set<string>();
      for (const item of items) {
        const keepId =
          item.id && existingIds.has(item.id) ? item.id : undefined;
        if (keepId) {
          keptIds.add(keepId);
          await connection.query
            .updateTable<ItemRow>('expenseItems')
            .set({
              categoryId: item.categoryId,
              expenseDate: item.expenseDate,
              amount: item.amount,
              description: item.description,
            })
            .where('id', '=', keepId)
            .execute();
        } else {
          await this.insertItems(connection.query, id, [item], now);
        }
      }
      const removedIds = existing
        .filter((row) => !keptIds.has(row.id))
        .map((row) => row.id);
      if (removedIds.length > 0) {
        await this.removeItemFiles(connection.query, removedIds);
        await connection.query
          .deleteFrom<ItemRow>('expenseItems')
          .where('id', 'in', removedIds)
          .execute();
      }
    });

    return this.getReport(actor, id);
  }

  public async deleteReport(actor: ExpenseActor, id: string): Promise<void> {
    const report = await this.loadReport(id);
    this.assertOwner(actor, report);
    if (report.status !== 'draft') {
      throw new ExpenseError(
        'HISTORICAL_REPORT',
        'A reimbursement that was submitted is kept for audit and cannot be deleted.',
        409,
      );
    }
    await this.database.transaction(async (connection) => {
      const items = await connection.query
        .selectFrom<ItemRow>('expenseItems')
        .select('id')
        .where('reportId', '=', id)
        .execute<{ id: string }>();
      await this.removeItemFiles(
        connection.query,
        items.map((row) => row.id),
      );
      await this.removeReportFiles(connection.query, id);
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
    if (report.status !== 'draft' && report.status !== 'rejected') {
      throw new ExpenseError(
        'INVALID_STATE',
        'Only a draft or returned reimbursement can be submitted.',
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
    // Freeze the material being submitted before the status flips, so a
    // resubmission after a return cannot rewrite what this revision reviewed.
    const snapshot = await this.collectRevisionSnapshot(
      id,
      (await this.latestRevisionNumber(id)) + 1,
    );
    await this.transition(actor, report, 'submitted', 'submit', null, snapshot);
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
      await this.openRevisionNumber(id),
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
    await this.transition(
      actor,
      report,
      'rejected',
      'reject',
      reason,
      await this.openRevisionNumber(id),
    );
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
    const revision = await this.openRevisionNumber(id);
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
      const updated = await connection.query
        .updateTable<ReportRow>('expenseReports')
        .set({
          status: 'paid',
          paidAt: now,
          paidBy: actor.userId,
          updatedAt: now,
        })
        .where('id', '=', id)
        .where('status', '=', 'approved')
        .execute();
      if (Number(updated.updatedCount ?? 1) === 0) {
        // A concurrent request paid it between the read and the write; roll the
        // whole transaction back so the ledger row is not posted either.
        throw new ExpenseError(
          'ALREADY_PAID',
          'This reimbursement has already been paid.',
          409,
        );
      }
      if (revision !== null) {
        await connection.query
          .updateTable<RevisionRow>('expenseReportRevisions')
          .set({ status: 'paid' })
          .where('reportId', '=', id)
          .where('revision', '=', revision)
          .execute();
      }
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
          revision,
          createdAt: now,
        })
        .execute();
    });
    return this.getReport(actor, id);
  }

  public async linkItemFile(
    actor: ExpenseActor,
    reportId: string,
    itemId: string,
    fileId: string,
  ): Promise<ExpenseReportDetail> {
    const report = await this.loadReport(reportId);
    this.assertFileManager(actor, report);
    const item = await this.database
      .query()
      .selectFrom<ItemRow>('expenseItems')
      .select('id')
      .where('id', '=', itemId)
      .where('reportId', '=', reportId)
      .executeTakeFirst<{ id: string }>();
    if (!item) {
      throw new ExpenseError('NOT_FOUND', 'Expense item not found.', 404);
    }
    await this.assertOwnedFile(actor, fileId);
    const existing = await this.findFileLink(fileId);
    if (existing) {
      if (existing.type === 'item' && existing.itemId === itemId) {
        return this.getReport(actor, reportId);
      }
      throw new ExpenseError(
        'FILE_ALREADY_LINKED',
        'This file is already attached to another record.',
        409,
      );
    }
    try {
      await this.database
        .query()
        .insertInto<ItemFileRow>('expenseItemFiles')
        .values({
          id: crypto.randomUUID(),
          reportId,
          itemId,
          fileId,
          createdAt: new Date(),
        })
        .execute();
    } catch {
      throw new ExpenseError(
        'FILE_ALREADY_LINKED',
        'This file is already attached to another record.',
        409,
      );
    }
    return this.getReport(actor, reportId);
  }

  public async linkReportFile(
    actor: ExpenseActor,
    reportId: string,
    fileId: string,
  ): Promise<ExpenseReportDetail> {
    const report = await this.loadReport(reportId);
    this.assertFileManager(actor, report);
    await this.assertOwnedFile(actor, fileId);
    const existing = await this.findFileLink(fileId);
    if (existing) {
      if (existing.type === 'report' && existing.reportId === reportId) {
        return this.getReport(actor, reportId);
      }
      throw new ExpenseError(
        'FILE_ALREADY_LINKED',
        'This file is already attached to another record.',
        409,
      );
    }
    try {
      await this.database
        .query()
        .insertInto<ReportFileRow>('expenseReportFiles')
        .values({
          id: crypto.randomUUID(),
          reportId,
          fileId,
          kind: 'supplement',
          createdAt: new Date(),
        })
        .execute();
    } catch {
      throw new ExpenseError(
        'FILE_ALREADY_LINKED',
        'This file is already attached to another record.',
        409,
      );
    }
    return this.getReport(actor, reportId);
  }

  public async removeFile(actor: ExpenseActor, fileId: string): Promise<void> {
    const file = await this.loadFileRow(fileId);
    if (!file) {
      throw new ExpenseError('NOT_FOUND', 'File not found.', 404);
    }
    // A receipt that a past submission was decided on stays reachable through
    // that revision, so its bytes and metadata are never deleted.
    const frozen = await this.isFileInRevision(fileId);
    const link = await this.findFileLink(fileId);
    if (!link) {
      if (frozen) {
        throw new ExpenseError(
          'HISTORICAL_FILE',
          'A receipt kept in the submission history cannot be removed.',
          409,
        );
      }
      // An upload that was never linked can only be removed by the employee who made it.
      if (file.ownerId !== actor.userId && actor.role !== 'admin') {
        throw new ExpenseError(
          'FORBIDDEN',
          'You cannot remove this file.',
          403,
        );
      }
      await this.deleteFileMetadata([fileId]);
      return;
    }
    const report = await this.loadReport(link.reportId);
    this.assertFileManager(actor, report);
    await this.database.transaction(async (connection) => {
      if (link.type === 'item') {
        await connection.query
          .deleteFrom<ItemFileRow>('expenseItemFiles')
          .where('id', '=', link.linkId)
          .execute();
      } else {
        await connection.query
          .deleteFrom<ReportFileRow>('expenseReportFiles')
          .where('id', '=', link.linkId)
          .execute();
      }
      // Removing a frozen receipt only detaches it from the working draft; the
      // revision snapshot and the bytes stay for the earlier decision.
      if (!frozen) {
        await connection.query
          .deleteFrom<FileRow>('expenseFiles')
          .where('id', '=', fileId)
          .execute();
      }
    });
  }

  public async canAccessFile(
    actor: ExpenseActor,
    fileId: string,
  ): Promise<boolean> {
    const file = await this.loadFileRow(fileId);
    if (!file) return false;
    if (actor.role === 'admin') return true;
    if (file.ownerId && file.ownerId === actor.userId) return true;
    // A file keeps its access when it is only reachable through a frozen
    // revision (its live link was replaced), because the report still governs it.
    const link = await this.findFileLink(fileId);
    const reportId = link
      ? link.reportId
      : await this.findRevisionReportId(fileId);
    if (!reportId) return false;
    const report = await this.database
      .query()
      .selectFrom<ReportRow>('expenseReports')
      .selectAll()
      .where('id', '=', reportId)
      .executeTakeFirst<ReportRow>();
    if (!report) return false;
    return visibleTo(actor, report);
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

    const { filesByItem, reportFiles } = await this.loadReportFiles(
      report.id,
      items.map((item) => item.id),
    );
    const revisions = await this.loadRevisions(report.id);

    const summary = toSummary(
      report,
      employees.get(report.employeeId),
      departments.get(report.departmentId),
      items.length,
      [...filesByItem.values()].reduce((sum, list) => sum + list.length, 0) +
        reportFiles.length,
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
        files: filesByItem.get(item.id) ?? [],
      })),
      files: reportFiles,
      actions: actions.map((action) => ({
        id: action.id,
        action: action.action,
        actorId: action.actorId,
        actorName: action.actorName ?? action.actorId,
        fromStatus: action.fromStatus,
        toStatus: action.toStatus,
        comment: action.comment,
        revision: action.revision === null ? null : Number(action.revision),
        createdAt: isoDateTime(action.createdAt),
      })),
      revisions,
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
    revision: number | RevisionSnapshot | null = null,
  ): Promise<void> {
    const now = new Date();
    const isDecision = toStatus === 'approved' || toStatus === 'rejected';
    const snapshot =
      revision !== null && typeof revision === 'object' ? revision : null;
    const revisionNumber =
      revision === null
        ? null
        : typeof revision === 'number'
          ? revision
          : revision.revision;
    await this.database.transaction(async (connection) => {
      const updated = await connection.query
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
      if (Number(updated.updatedCount ?? 1) === 0) {
        // The status moved on between the read and the write: a duplicate
        // submission or decision racing this one. Refuse instead of writing a
        // second action, revision or payment.
        throw new ExpenseError(
          'CONFLICT',
          'The reimbursement changed while this request was in flight. Reload and try again.',
          409,
        );
      }
      if (snapshot) {
        await this.insertRevision(connection.query, report, snapshot, now);
      } else if (isDecision && revisionNumber !== null) {
        await connection.query
          .updateTable<RevisionRow>('expenseReportRevisions')
          .set({
            status: toStatus,
            decision: toStatus === 'approved' ? 'approved' : 'rejected',
            comment,
            decidedBy: actor.userId,
            decidedByName: actor.name,
            decidedAt: now,
          })
          .where('reportId', '=', report.id)
          .where('revision', '=', revisionNumber)
          .execute();
      }
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
          revision: revisionNumber,
          createdAt: now,
        })
        .execute();
    });
  }

  /**
   * Captures the items and files of the current draft as an immutable revision.
   * Called before the status update so a failure leaves neither a revision nor a
   * status change behind.
   */
  private async collectRevisionSnapshot(
    reportId: string,
    revision: number,
  ): Promise<RevisionSnapshot> {
    const query = this.database.query();
    const items = await this.loadItems([reportId]);
    const categories = await this.categoryMap();
    const [itemLinks, reportLinks] = await Promise.all([
      query
        .selectFrom<ItemFileRow>('expenseItemFiles')
        .selectAll()
        .where('reportId', '=', reportId)
        .execute<ItemFileRow>(),
      query
        .selectFrom<ReportFileRow>('expenseReportFiles')
        .selectAll()
        .where('reportId', '=', reportId)
        .execute<ReportFileRow>(),
    ]);
    const fileIds = [
      ...new Set([...itemLinks, ...reportLinks].map((row) => row.fileId)),
    ];
    const fileRows =
      fileIds.length > 0
        ? await query
            .selectFrom<FileRow>('expenseFiles')
            .selectAll()
            .where('id', 'in', fileIds)
            .execute<FileRow>()
        : [];
    const fileMap = new Map(fileRows.map((row) => [row.id, row]));
    const files: RevisionSnapshotFile[] = [];
    for (const link of itemLinks) {
      const row = fileMap.get(link.fileId);
      if (!row) continue;
      files.push({
        itemId: link.itemId,
        fileId: row.id,
        filename: row.filename,
        ext: row.ext,
        mimeType: row.mimeType,
        size: Number(row.size),
        kind: 'receipt',
      });
    }
    for (const link of reportLinks) {
      const row = fileMap.get(link.fileId);
      if (!row) continue;
      files.push({
        itemId: null,
        fileId: row.id,
        filename: row.filename,
        ext: row.ext,
        mimeType: row.mimeType,
        size: Number(row.size),
        kind: link.kind || 'supplement',
      });
    }
    return {
      revision,
      items: items.map((item) => ({
        itemId: item.id,
        categoryId: item.categoryId,
        categoryName: categories.get(item.categoryId)?.name ?? item.categoryId,
        expenseDate: toDate(item.expenseDate),
        amount: Number(item.amount),
        description: item.description,
      })),
      files,
    };
  }

  private async insertRevision(
    query: QueryAdapter,
    report: ReportRow,
    snapshot: RevisionSnapshot,
    now: Date,
  ): Promise<void> {
    const revisionId = crypto.randomUUID();
    await query
      .insertInto<RevisionRow>('expenseReportRevisions')
      .values({
        id: revisionId,
        reportId: report.id,
        revision: snapshot.revision,
        status: 'submitted',
        decision: null,
        comment: null,
        decidedBy: null,
        decidedByName: null,
        submittedAt: now,
        decidedAt: null,
        createdAt: now,
      })
      .execute();
    for (const item of snapshot.items) {
      await query
        .insertInto<RevisionItemRow>('expenseRevisionItems')
        .values({
          id: crypto.randomUUID(),
          revisionId,
          reportId: report.id,
          itemId: item.itemId,
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          expenseDate: item.expenseDate,
          amount: item.amount,
          description: item.description,
          createdAt: now,
        })
        .execute();
    }
    for (const file of snapshot.files) {
      await query
        .insertInto<RevisionFileRow>('expenseRevisionFiles')
        .values({
          id: crypto.randomUUID(),
          revisionId,
          reportId: report.id,
          itemId: file.itemId,
          fileId: file.fileId,
          filename: file.filename,
          ext: file.ext,
          mimeType: file.mimeType,
          size: file.size,
          kind: file.kind,
          createdAt: now,
        })
        .execute();
    }
  }

  private async latestRevisionNumber(reportId: string): Promise<number> {
    const row = await this.database
      .query()
      .selectFrom<RevisionRow>('expenseReportRevisions')
      .select('revision')
      .where('reportId', '=', reportId)
      .orderBy('revision', 'desc')
      .limit(1)
      .executeTakeFirst<{ revision: number }>();
    return row ? Number(row.revision) : 0;
  }

  /**
   * The revision a decision applies to: the newest submission. Returns null
   * when the report never reached a revision, which keeps legacy rows working.
   */
  private async openRevisionNumber(reportId: string): Promise<number | null> {
    const latest = await this.latestRevisionNumber(reportId);
    return latest > 0 ? latest : null;
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

  private async fileCountMap(
    reportIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (reportIds.length === 0) return new Map();
    const query = this.database.query();
    const [itemLinks, reportLinks] = await Promise.all([
      query
        .selectFrom<ItemFileRow>('expenseItemFiles')
        .select('reportId')
        .where('reportId', 'in', reportIds)
        .execute<{ reportId: string }>(),
      query
        .selectFrom<ReportFileRow>('expenseReportFiles')
        .select('reportId')
        .where('reportId', 'in', reportIds)
        .execute<{ reportId: string }>(),
    ]);
    const counts = new Map<string, number>();
    for (const row of [...itemLinks, ...reportLinks]) {
      counts.set(row.reportId, (counts.get(row.reportId) ?? 0) + 1);
    }
    return counts;
  }

  private async loadReportFiles(
    reportId: string,
    itemIds: readonly string[],
  ): Promise<{
    readonly filesByItem: Map<string, ExpenseFileView[]>;
    readonly reportFiles: ExpenseFileView[];
  }> {
    const query = this.database.query();
    const [itemLinks, reportLinks] = await Promise.all([
      itemIds.length > 0
        ? query
            .selectFrom<ItemFileRow>('expenseItemFiles')
            .selectAll()
            .where('reportId', '=', reportId)
            .execute<ItemFileRow>()
        : Promise.resolve([] as ItemFileRow[]),
      query
        .selectFrom<ReportFileRow>('expenseReportFiles')
        .selectAll()
        .where('reportId', '=', reportId)
        .execute<ReportFileRow>(),
    ]);
    const fileIds = [
      ...new Set([...itemLinks, ...reportLinks].map((row) => row.fileId)),
    ];
    const fileRows =
      fileIds.length > 0
        ? await query
            .selectFrom<FileRow>('expenseFiles')
            .selectAll()
            .where('id', 'in', fileIds)
            .execute<FileRow>()
        : [];
    const fileMap = new Map(fileRows.map((row) => [row.id, row]));
    const filesByItem = new Map<string, ExpenseFileView[]>();
    for (const link of itemLinks) {
      const row = fileMap.get(link.fileId);
      if (!row) continue;
      const list = filesByItem.get(link.itemId) ?? [];
      list.push(this.toFileView(row));
      filesByItem.set(link.itemId, list);
    }
    const reportFiles = reportLinks
      .map((link) => fileMap.get(link.fileId))
      .filter((row): row is FileRow => row !== undefined)
      .map((row) => this.toFileView(row));
    return { filesByItem, reportFiles };
  }

  /**
   * Loads every submission snapshot for a report, oldest first. Items and files
   * are read from the frozen revision tables, never from the live links, so a
   * later edit cannot change what an earlier revision shows.
   */
  private async loadRevisions(
    reportId: string,
  ): Promise<readonly ExpenseRevisionView[]> {
    const query = this.database.query();
    const revisions = await query
      .selectFrom<RevisionRow>('expenseReportRevisions')
      .selectAll()
      .where('reportId', '=', reportId)
      .orderBy('revision', 'asc')
      .execute<RevisionRow>();
    if (revisions.length === 0) return [];
    const [itemRows, fileRows] = await Promise.all([
      query
        .selectFrom<RevisionItemRow>('expenseRevisionItems')
        .selectAll()
        .where('reportId', '=', reportId)
        .orderBy('expenseDate', 'asc')
        .execute<RevisionItemRow>(),
      query
        .selectFrom<RevisionFileRow>('expenseRevisionFiles')
        .selectAll()
        .where('reportId', '=', reportId)
        .execute<RevisionFileRow>(),
    ]);
    const itemsByRevision = new Map<string, RevisionItemRow[]>();
    for (const row of itemRows) {
      const list = itemsByRevision.get(row.revisionId) ?? [];
      list.push(row);
      itemsByRevision.set(row.revisionId, list);
    }
    const filesByRevision = new Map<string, RevisionFileRow[]>();
    for (const row of fileRows) {
      const list = filesByRevision.get(row.revisionId) ?? [];
      list.push(row);
      filesByRevision.set(row.revisionId, list);
    }
    return revisions.map((revision) => {
      const files = filesByRevision.get(revision.id) ?? [];
      const items = (itemsByRevision.get(revision.id) ?? []).map((item) => ({
        id: item.id,
        itemId: item.itemId,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        expenseDate: isoDate(item.expenseDate),
        amount: roundMoney(Number(item.amount)),
        description: item.description,
        files: files
          .filter((file) => file.itemId === item.itemId)
          .map((file) => this.toSnapshotFileView(file)),
      }));
      const reportFiles = files
        .filter((file) => file.itemId === null)
        .map((file) => this.toSnapshotFileView(file));
      return {
        id: revision.id,
        revision: Number(revision.revision),
        status: revision.status as ExpenseStatus,
        decision:
          revision.decision === 'approved' || revision.decision === 'rejected'
            ? revision.decision
            : null,
        comment: revision.comment,
        decidedBy: revision.decidedBy,
        decidedByName: revision.decidedByName,
        submittedAt: isoDateTime(revision.submittedAt),
        decidedAt: isoDateTimeOrNull(revision.decidedAt),
        items,
        files: reportFiles,
        fileCount:
          items.reduce((sum, item) => sum + item.files.length, 0) +
          reportFiles.length,
      };
    });
  }

  private toSnapshotFileView(row: RevisionFileRow): ExpenseFileView {
    return {
      ...this.toFileView({
        id: row.fileId,
        disk: '',
        key: '',
        filename: row.filename,
        ext: row.ext,
        mimeType: row.mimeType,
        size: row.size,
        ownerId: null,
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
      }),
      createdAt: isoDateTime(row.createdAt),
    };
  }

  private async findRevisionReportId(fileId: string): Promise<string | null> {
    const row = await this.database
      .query()
      .selectFrom<RevisionFileRow>('expenseRevisionFiles')
      .select('reportId')
      .where('fileId', '=', fileId)
      .executeTakeFirst<{ reportId: string }>();
    return row ? row.reportId : null;
  }

  private async isFileInRevision(fileId: string): Promise<boolean> {
    const row = await this.database
      .query()
      .selectFrom<RevisionFileRow>('expenseRevisionFiles')
      .select('id')
      .where('fileId', '=', fileId)
      .executeTakeFirst<{ id: string }>();
    return row !== undefined;
  }

  private toFileView(row: FileRow): ExpenseFileView {
    const base = this.publicBasePath.replace(/\/$/, '');
    const extension = row.ext ? `.${encodeURIComponent(row.ext)}` : '';
    return {
      id: row.id,
      filename: row.filename,
      ext: row.ext,
      mimeType: row.mimeType,
      size: Number(row.size),
      createdAt: isoDateTime(row.createdAt),
      contentUrl: `${base}${EXPENSE_FILE_ACCESS_PATH}/${encodeURIComponent(row.id)}${extension}`,
    };
  }

  private async loadFileRow(id: string): Promise<FileRow | undefined> {
    return this.database
      .query()
      .selectFrom<FileRow>('expenseFiles')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<FileRow>();
  }

  private async findFileLink(fileId: string): Promise<FileLink | null> {
    const query = this.database.query();
    const item = await query
      .selectFrom<ItemFileRow>('expenseItemFiles')
      .selectAll()
      .where('fileId', '=', fileId)
      .executeTakeFirst<ItemFileRow>();
    if (item) {
      return {
        type: 'item',
        linkId: item.id,
        reportId: item.reportId,
        itemId: item.itemId,
      };
    }
    const report = await query
      .selectFrom<ReportFileRow>('expenseReportFiles')
      .selectAll()
      .where('fileId', '=', fileId)
      .executeTakeFirst<ReportFileRow>();
    if (report) {
      return { type: 'report', linkId: report.id, reportId: report.reportId };
    }
    return null;
  }

  private async assertOwnedFile(
    actor: ExpenseActor,
    fileId: string,
  ): Promise<void> {
    const file = await this.loadFileRow(fileId);
    if (!file) {
      throw new ExpenseError('NOT_FOUND', 'File not found.', 404);
    }
    if (Number(file.size) <= 0) {
      throw new ExpenseError(
        'INVALID_FILE',
        'Empty files cannot be attached.',
        400,
      );
    }
    if (file.ownerId !== actor.userId && actor.role !== 'admin') {
      throw new ExpenseError(
        'FORBIDDEN',
        'You can only attach files you uploaded yourself.',
        403,
      );
    }
  }

  private assertFileManager(actor: ExpenseActor, report: ReportRow): void {
    if (report.employeeId !== actor.employeeId && actor.role !== 'admin') {
      throw new ExpenseError(
        'FORBIDDEN',
        'You can only change files on your own reimbursement.',
        403,
      );
    }
    // Read-only once a decision is reached, for the administrator too: the
    // material a manager approved and finance paid must not change afterwards.
    if (report.status !== 'draft' && report.status !== 'rejected') {
      throw new ExpenseError(
        'INVALID_STATE',
        'Files can only be changed while the reimbursement is a draft or returned.',
        409,
      );
    }
  }

  private async removeItemFiles(
    query: QueryAdapter,
    itemIds: readonly string[],
  ): Promise<void> {
    if (itemIds.length === 0) return;
    const links = await query
      .selectFrom<ItemFileRow>('expenseItemFiles')
      .selectAll()
      .where('itemId', 'in', itemIds)
      .execute<ItemFileRow>();
    if (links.length === 0) return;
    await query
      .deleteFrom<ItemFileRow>('expenseItemFiles')
      .where('itemId', 'in', itemIds)
      .execute();
    await this.deleteUnreferencedFiles(
      query,
      links.map((link) => link.fileId),
    );
  }

  private async removeReportFiles(
    query: QueryAdapter,
    reportId: string,
  ): Promise<void> {
    const links = await query
      .selectFrom<ReportFileRow>('expenseReportFiles')
      .selectAll()
      .where('reportId', '=', reportId)
      .execute<ReportFileRow>();
    if (links.length === 0) return;
    await query
      .deleteFrom<ReportFileRow>('expenseReportFiles')
      .where('reportId', '=', reportId)
      .execute();
    await this.deleteUnreferencedFiles(
      query,
      links.map((link) => link.fileId),
    );
  }

  /**
   * Deletes file metadata only for files no revision references. A file that was
   * part of a submitted revision is kept so the earlier decision stays visible.
   */
  private async deleteUnreferencedFiles(
    query: QueryAdapter,
    fileIds: readonly string[],
  ): Promise<void> {
    const unique = [...new Set(fileIds)];
    if (unique.length === 0) return;
    const referenced = await query
      .selectFrom<RevisionFileRow>('expenseRevisionFiles')
      .select('fileId')
      .where('fileId', 'in', unique)
      .execute<{ fileId: string }>();
    const keep = new Set(referenced.map((row) => row.fileId));
    const toDelete = unique.filter((id) => !keep.has(id));
    if (toDelete.length === 0) return;
    await query
      .deleteFrom<FileRow>('expenseFiles')
      .where('id', 'in', toDelete)
      .execute();
  }

  private async deleteFileMetadata(fileIds: readonly string[]): Promise<void> {
    if (fileIds.length === 0) return;
    await this.database
      .query()
      .deleteFrom<FileRow>('expenseFiles')
      .where('id', 'in', [...fileIds])
      .execute();
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
    // Derive the next sequence from the largest number in use rather than from a
    // row count: deleting a draft would otherwise let a new report reuse the
    // number of one that is still there.
    const rows = await this.database
      .query()
      .selectFrom<ReportRow>('expenseReports')
      .select('number')
      .where('number', 'like', `${prefix}-%`)
      .execute<{ number: string }>();
    let highest = 0;
    for (const row of rows) {
      const parsed = Number.parseInt(row.number.slice(prefix.length + 1), 10);
      if (Number.isFinite(parsed) && parsed > highest) highest = parsed;
    }
    return `${prefix}-${String(highest + 1).padStart(4, '0')}`;
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
  readonly id?: string;
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
  const isEditable = report.status === 'draft' || report.status === 'rejected';
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
    canEdit: canManage && isEditable,
    // A submitted reimbursement is kept as audit history, so only a draft that
    // never reached a decision can be deleted.
    canDelete: canManage && report.status === 'draft',
    canSubmit: canManage && isEditable,
    canApprove: canReview,
    canReject: canReview,
    canPay: isFinance && isApproved,
    canManageFiles: canManage && isEditable,
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
  fileCount: number,
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
    fileCount,
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
      id: normalizeText(item.id) ?? undefined,
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

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function endOfDay(value: string): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}
