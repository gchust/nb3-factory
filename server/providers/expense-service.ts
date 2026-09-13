import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager, QueryAdapter, Row } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  ExpenseError,
  assertPaymentDate,
  assertRejectReason,
  assertTransition,
  claimCapabilities,
  computeTotalCents,
  formatClaimNumber,
  monthOf,
  normalizeClaimInput,
  rolesFromPermissionSets,
  type ClaimCapabilities,
  type ClaimInput,
  type ExpenseItemInput,
  type ExpenseRole,
} from './expense-domain.js';

export const expenseServiceToken: ServiceToken<ExpenseService> =
  createServiceToken<ExpenseService>('nb3-factory/expense-service');

interface Viewer {
  readonly userId: string;
  readonly name: string;
  readonly roles: ReadonlySet<ExpenseRole>;
  readonly departmentIds: readonly number[];
  readonly managedDepartmentIds: readonly number[];
}

interface ExpenseServiceOptions {
  readonly database: DatabaseManager;
  readonly authorization?: Pick<AppAuthorization, 'permissionSets'>;
}

export interface ViewerInfo {
  readonly userId: string;
  readonly name: string;
  readonly roles: readonly ExpenseRole[];
  readonly departmentIds: readonly number[];
  readonly managedDepartmentIds: readonly number[];
  readonly capabilities: {
    readonly viewAll: boolean;
    readonly review: boolean;
    readonly pay: boolean;
    readonly approveAny: boolean;
    readonly viewStats: boolean;
  };
}

export interface StatisticEntry {
  readonly key: string;
  readonly totalCents: number;
}

export interface ExpenseStatistics {
  readonly totalCents: number;
  readonly pendingCents: number;
  readonly claimCount: number;
  readonly byDepartment: readonly StatisticEntry[];
  readonly byCategory: readonly StatisticEntry[];
  readonly byMonth: readonly StatisticEntry[];
}

export interface ClaimRecord {
  readonly id: number;
  readonly number: string;
  readonly applicantId: string;
  readonly applicantName: string;
  readonly departmentId: number | null;
  readonly departmentName: string | null;
  readonly reason: string;
  readonly expenseDate: string;
  readonly totalCents: number;
  readonly status: string;
  readonly rejectReason: string | null;
  readonly paymentDate: string | null;
  readonly loanId: number | null;
  readonly loanSummary: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly capabilities: ClaimCapabilities;
  readonly items: readonly ExpenseItemRecord[];
  readonly attachments: readonly AttachmentRecord[];
}

export interface ExpenseItemRecord {
  readonly id: number;
  readonly category: string;
  readonly amountCents: number;
  readonly remark: string | null;
}

export interface AttachmentRecord {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly url: string;
}

export interface LoanRecord {
  readonly id: number;
  readonly borrowerId: string;
  readonly borrowerName: string;
  readonly amountCents: number;
  readonly loanDate: string;
  readonly purpose: string | null;
  readonly settled: boolean;
  readonly settledByClaimId: number | null;
  readonly settledByClaimNumber: string | null;
  readonly settledAt: string | null;
  readonly capabilities: { readonly canSettle: boolean };
}

export interface DepartmentRecord {
  readonly id: number;
  readonly name: string;
  readonly code: string | null;
  readonly managerId: string | null;
  readonly managerName: string | null;
  readonly memberCount: number;
}

export class ExpenseService {
  constructor(private readonly options: ExpenseServiceOptions) {}

  async viewerInfo(userId: string): Promise<ViewerInfo> {
    const viewer = await this.resolveViewer(userId);
    return {
      userId: viewer.userId,
      name: viewer.name,
      roles: [...viewer.roles],
      departmentIds: viewer.departmentIds,
      managedDepartmentIds: viewer.managedDepartmentIds,
      capabilities: {
        viewAll: viewer.roles.has('admin') || viewer.roles.has('finance'),
        review: viewer.roles.has('admin') || viewer.roles.has('finance'),
        pay: viewer.roles.has('admin') || viewer.roles.has('finance'),
        approveAny: viewer.roles.has('admin') || viewer.roles.has('manager'),
        viewStats: viewer.roles.has('admin') || viewer.roles.has('finance'),
      },
    };
  }

  async listClaims(userId: string): Promise<readonly ClaimRecord[]> {
    const viewer = await this.resolveViewer(userId);
    const canViewAll = viewer.roles.has('admin') || viewer.roles.has('finance');
    const managed = viewer.managedDepartmentIds;
    let builder = this.options.database
      .query()
      .selectFrom('expenseClaims')
      .selectAll();
    if (!canViewAll) {
      builder =
        managed.length > 0
          ? builder.where((eb) =>
              eb.or([
                eb('applicantId', '=', viewer.userId),
                eb('departmentId', 'in', managed),
              ]),
            )
          : builder.where('applicantId', '=', viewer.userId);
    }
    const rows = await builder
      .orderBy('createdAt', 'desc')
      .limit(500)
      .execute();
    return this.enrichClaims(rows, viewer);
  }

  async listApprovalQueue(userId: string): Promise<readonly ClaimRecord[]> {
    const viewer = await this.resolveViewer(userId);
    const admin = viewer.roles.has('admin');
    if (!admin && !viewer.roles.has('manager')) {
      throw new ExpenseError(
        'FORBIDDEN',
        'Only a department manager may review approvals.',
        403,
      );
    }
    let builder = this.options.database
      .query()
      .selectFrom('expenseClaims')
      .selectAll()
      .where('status', '=', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(500);
    if (!admin) {
      if (viewer.managedDepartmentIds.length === 0) return [];
      builder = builder.where(
        'departmentId',
        'in',
        viewer.managedDepartmentIds,
      );
    }
    const rows = await builder.execute();
    return this.enrichClaims(rows, viewer);
  }

  async listPaymentQueue(userId: string): Promise<readonly ClaimRecord[]> {
    const viewer = await this.resolveViewer(userId);
    if (!viewer.roles.has('admin') && !viewer.roles.has('finance')) {
      throw new ExpenseError(
        'FORBIDDEN',
        'Only finance may view the payment queue.',
        403,
      );
    }
    const rows = await this.options.database
      .query()
      .selectFrom('expenseClaims')
      .selectAll()
      .where('status', 'in', ['approved', 'pending_payment'])
      .orderBy('createdAt', 'asc')
      .limit(500)
      .execute();
    return this.enrichClaims(rows, viewer);
  }

  async getClaim(userId: string, claimId: number): Promise<ClaimRecord> {
    const viewer = await this.resolveViewer(userId);
    const row = await this.findClaim(claimId);
    this.assertVisible(row, viewer);
    const [claim] = await this.enrichClaims([row], viewer);
    return claim;
  }

  async createClaim(userId: string, input: ClaimInput): Promise<ClaimRecord> {
    const viewer = await this.resolveViewer(userId);
    const normalized = normalizeClaimInput(input);
    const loan = await this.resolveLoanForClaim(
      userId,
      viewer,
      normalized.loanId,
    );
    await this.assertDepartment(normalized.departmentId);
    await this.assertFiles(normalized.fileIds);

    const totalCents = computeTotalCents(normalized.items);
    const number = await this.nextClaimNumber(normalized.expenseDate);
    const now = new Date();
    const claimId = await this.options.database.transaction(
      async (connection) => {
        const inserted = await connection.query
          .insertInto('expenseClaims')
          .values({
            number,
            applicantId: userId,
            departmentId: normalized.departmentId,
            reason: normalized.reason,
            expenseDate: normalized.expenseDate,
            totalCents,
            status: 'pending',
            rejectReason: null,
            paymentDate: null,
            loanId: normalized.loanId,
            createdById: userId,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        const id = Number(inserted.insertId);
        await this.replaceItems(connection.query, id, normalized.items, now);
        await this.replaceAttachments(
          connection.query,
          id,
          normalized.fileIds,
          now,
        );
        if (loan && normalized.loanId !== null) {
          await this.settleLoan(connection.query, normalized.loanId, id, now);
        }
        return id;
      },
    );
    return this.getClaim(userId, claimId);
  }

  async updateClaim(
    userId: string,
    claimId: number,
    input: ClaimInput,
  ): Promise<ClaimRecord> {
    const viewer = await this.resolveViewer(userId);
    const existing = await this.findClaim(claimId);
    if (!existing)
      throw new ExpenseError('NOT_FOUND', 'Expense claim not found.', 404);
    this.assertOwnership(existing, viewer);
    if (!viewer.roles.has('admin') && !this.isApplicant(existing, viewer)) {
      throw new ExpenseError(
        'FORBIDDEN',
        'You may only edit your own claims.',
        403,
      );
    }
    if (existing.status !== 'pending' && existing.status !== 'rejected') {
      throw new ExpenseError(
        'CLAIM_LOCKED',
        'Approved or paid claims cannot change their amounts or items.',
        409,
      );
    }

    const normalized = normalizeClaimInput(input);
    await this.assertDepartment(normalized.departmentId);
    await this.assertFiles(normalized.fileIds);
    const nextLoanId = normalized.loanId;
    if (nextLoanId !== null) {
      await this.resolveLoanForClaim(
        userId,
        viewer,
        nextLoanId,
        existing.loanId,
      );
    }
    const totalCents = computeTotalCents(normalized.items);
    const now = new Date();

    await this.options.database.transaction(async (connection) => {
      await connection.query
        .updateTable('expenseClaims')
        .set({
          departmentId: normalized.departmentId,
          reason: normalized.reason,
          expenseDate: normalized.expenseDate,
          totalCents,
          loanId: nextLoanId,
          updatedAt: now,
        })
        .where('id', '=', claimId)
        .execute();
      await this.replaceItems(connection.query, claimId, normalized.items, now);
      await this.replaceAttachments(
        connection.query,
        claimId,
        normalized.fileIds,
        now,
      );

      const previousLoanId = asNullableNumber(existing.loanId);
      if (previousLoanId !== null && previousLoanId !== nextLoanId) {
        await this.revertLoan(connection.query, previousLoanId, now);
      }
      if (nextLoanId !== null && nextLoanId !== previousLoanId) {
        await this.settleLoan(connection.query, nextLoanId, claimId, now);
      }
    });
    return this.getClaim(userId, claimId);
  }

  async deleteClaim(userId: string, claimId: number): Promise<void> {
    const viewer = await this.resolveViewer(userId);
    const existing = await this.findClaim(claimId);
    if (!existing)
      throw new ExpenseError('NOT_FOUND', 'Expense claim not found.', 404);
    if (!viewer.roles.has('admin') && !this.isApplicant(existing, viewer)) {
      throw new ExpenseError(
        'FORBIDDEN',
        'You may only delete your own claims.',
        403,
      );
    }
    if (existing.status === 'paid') {
      throw new ExpenseError(
        'INVALID_STATUS',
        'A paid claim cannot be deleted.',
        409,
      );
    }
    const now = new Date();
    await this.options.database.transaction(async (connection) => {
      await this.revertLoan(
        connection.query,
        asNullableNumber(existing.loanId),
        now,
      );
      await connection.query
        .deleteFrom('expenseItems')
        .where('claimId', '=', claimId)
        .execute();
      await connection.query
        .deleteFrom('expenseClaimAttachments')
        .where('claimId', '=', claimId)
        .execute();
      await connection.query
        .deleteFrom('expenseClaims')
        .where('id', '=', claimId)
        .execute();
    });
  }

  async approve(userId: string, claimId: number): Promise<ClaimRecord> {
    const viewer = await this.resolveViewer(userId);
    const existing = await this.requireClaim(claimId);
    assertTransition(String(existing.status), 'approve');
    if (
      !viewer.roles.has('admin') &&
      !this.managesDepartment(existing, viewer)
    ) {
      throw new ExpenseError(
        'FORBIDDEN',
        'Only the department manager may approve.',
        403,
      );
    }
    await this.setStatus(claimId, 'approved', { rejectReason: null });
    return this.getClaim(userId, claimId);
  }

  async reject(
    userId: string,
    claimId: number,
    reason: unknown,
  ): Promise<ClaimRecord> {
    const viewer = await this.resolveViewer(userId);
    const existing = await this.requireClaim(claimId);
    const rejectReason = assertRejectReason(reason);
    assertTransition(String(existing.status), 'reject');
    const admin = viewer.roles.has('admin');
    const finance = viewer.roles.has('finance');
    const pending = existing.status === 'pending';
    const allowed = pending
      ? admin || this.managesDepartment(existing, viewer) || finance
      : admin || finance;
    if (!allowed) {
      throw new ExpenseError(
        'FORBIDDEN',
        'You may not reject this claim.',
        403,
      );
    }
    await this.setStatus(claimId, 'rejected', { rejectReason });
    return this.getClaim(userId, claimId);
  }

  async review(userId: string, claimId: number): Promise<ClaimRecord> {
    const viewer = await this.resolveViewer(userId);
    if (!viewer.roles.has('admin') && !viewer.roles.has('finance')) {
      throw new ExpenseError(
        'FORBIDDEN',
        'Only finance may review a claim.',
        403,
      );
    }
    const existing = await this.requireClaim(claimId);
    assertTransition(String(existing.status), 'review');
    await this.setStatus(claimId, 'pending_payment', {});
    return this.getClaim(userId, claimId);
  }

  async pay(
    userId: string,
    claimId: number,
    paymentDate: unknown,
  ): Promise<ClaimRecord> {
    const viewer = await this.resolveViewer(userId);
    if (!viewer.roles.has('admin') && !viewer.roles.has('finance')) {
      throw new ExpenseError(
        'FORBIDDEN',
        'Only finance may register a payment.',
        403,
      );
    }
    const existing = await this.requireClaim(claimId);
    assertTransition(String(existing.status), 'pay');
    const date = assertPaymentDate(paymentDate);
    await this.setStatus(claimId, 'paid', { paymentDate: date });
    return this.getClaim(userId, claimId);
  }

  async listLoans(
    userId: string,
    options: { readonly unsettledOnly?: boolean } = {},
  ): Promise<readonly LoanRecord[]> {
    const viewer = await this.resolveViewer(userId);
    const query = this.options.database.query();
    let builder = query
      .selectFrom('loans')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .limit(500);
    if (!viewer.roles.has('admin')) {
      builder = builder.where('borrowerId', '=', userId);
    }
    if (options.unsettledOnly) {
      builder = builder.where('settled', '=', false);
    }
    const rows = await builder.execute();
    return this.enrichLoans(rows, viewer);
  }

  async createLoan(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<LoanRecord> {
    const viewer = await this.resolveViewer(userId);
    const requestedBorrower =
      typeof input.borrowerId === 'string' && input.borrowerId
        ? input.borrowerId
        : userId;
    if (requestedBorrower !== userId && !viewer.roles.has('admin')) {
      throw new ExpenseError(
        'FORBIDDEN',
        'You may only register your own loan.',
        403,
      );
    }
    const amountCents = Number(input.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new ExpenseError(
        'VALIDATION',
        'Loan amount must be a positive amount.',
      );
    }
    const loanDate = typeof input.loanDate === 'string' ? input.loanDate : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(loanDate)) {
      throw new ExpenseError('VALIDATION', 'Loan date must be a valid date.');
    }
    const purpose =
      typeof input.purpose === 'string' && input.purpose.trim()
        ? input.purpose.trim()
        : null;
    const now = new Date();
    const inserted = await this.options.database
      .query()
      .insertInto('loans')
      .values({
        borrowerId: requestedBorrower,
        amountCents,
        loanDate,
        purpose,
        settled: false,
        settledByClaimId: null,
        settledAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const [loan] = await this.enrichLoans(
      [
        await this.options.database
          .query()
          .selectFrom('loans')
          .selectAll()
          .where('id', '=', Number(inserted.insertId))
          .executeTakeFirstOrThrow(),
      ],
      viewer,
    );
    return loan;
  }

  async listDepartments(): Promise<readonly DepartmentRecord[]> {
    const query = this.options.database.query();
    const rows = await query
      .selectFrom('departments')
      .selectAll()
      .orderBy('id', 'asc')
      .execute();
    const members = await query
      .selectFrom('departmentMembers')
      .select(['departmentId', 'userId'])
      .execute();
    const userIds = new Set(
      rows.map((row) => asNullableString(row.managerId)).filter(isString),
    );
    for (const member of members) {
      const id = asNullableString(member.userId);
      if (id) userIds.add(id);
    }
    const names = await this.userNames([...userIds]);
    const counts = new Map<number, number>();
    for (const member of members) {
      const id = asNullableNumber(member.departmentId);
      if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return rows.map((row) => ({
      id: asNumber(row.id),
      name: asString(row.name),
      code: asNullableString(row.code),
      managerId: asNullableString(row.managerId),
      managerName: names.get(asNullableString(row.managerId) ?? '') ?? null,
      memberCount: counts.get(asNumber(row.id)) ?? 0,
    }));
  }

  async listUsers(
    userId: string,
  ): Promise<readonly { id: string; name: string; username: string }[]> {
    const viewer = await this.resolveViewer(userId);
    if (!viewer.roles.has('admin')) {
      throw new ExpenseError(
        'FORBIDDEN',
        'Only an administrator may list users.',
        403,
      );
    }
    const rows = await this.options.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .orderBy('name', 'asc')
      .execute();
    return rows.map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
      username: asString(row.username),
    }));
  }

  async statistics(userId: string): Promise<ExpenseStatistics> {
    const viewer = await this.resolveViewer(userId);
    if (!viewer.roles.has('admin') && !viewer.roles.has('finance')) {
      throw new ExpenseError(
        'FORBIDDEN',
        'Only finance may view statistics.',
        403,
      );
    }
    const query = this.options.database.query();
    const claims = await query
      .selectFrom('expenseClaims')
      .selectAll()
      .where('status', '!=', 'rejected')
      .execute();
    const claimIds = claims.map((row) => asNumber(row.id));
    const items = claimIds.length
      ? await query
          .selectFrom('expenseItems')
          .select(['claimId', 'category', 'amountCents'])
          .where('claimId', 'in', claimIds)
          .execute()
      : [];
    const departments = await this.listDepartments();
    const departmentNames = new Map(
      departments.map((item) => [item.id, item.name]),
    );

    const byDepartment = new Map<string, number>();
    const byMonth = new Map<string, number>();
    let pendingCents = 0;
    for (const claim of claims) {
      const total = asNumber(claim.totalCents);
      const departmentId = asNullableNumber(claim.departmentId);
      const name =
        departmentId === null
          ? '未分配部门'
          : (departmentNames.get(departmentId) ?? '未分配部门');
      byDepartment.set(name, (byDepartment.get(name) ?? 0) + total);
      const month = monthOf(asString(claim.expenseDate));
      byMonth.set(month, (byMonth.get(month) ?? 0) + total);
      if (claim.status === 'pending') pendingCents += total;
    }
    const byCategory = new Map<string, number>();
    for (const item of items) {
      const category = asString(item.category);
      byCategory.set(
        category,
        (byCategory.get(category) ?? 0) + asNumber(item.amountCents),
      );
    }

    return {
      totalCents: claims.reduce(
        (sum, claim) => sum + asNumber(claim.totalCents),
        0,
      ),
      pendingCents,
      claimCount: claims.length,
      byDepartment: mapToArray(byDepartment),
      byCategory: mapToArray(byCategory),
      byMonth: mapToArray(byMonth).sort((a, b) => a.key.localeCompare(b.key)),
    };
  }

  // --- internals ---------------------------------------------------------------------------------------------

  private async resolveViewer(userId: string): Promise<Viewer> {
    const query = this.options.database.query();
    const [user, membership, managed] = await Promise.all([
      query
        .selectFrom('user')
        .select(['id', 'name'])
        .where('id', '=', userId)
        .executeTakeFirst(),
      query
        .selectFrom('departmentMembers')
        .select('departmentId')
        .where('userId', '=', userId)
        .execute(),
      query
        .selectFrom('departments')
        .select('id')
        .where('managerId', '=', userId)
        .execute(),
    ]);
    const departmentIds = membership
      .map((row) => asNullableNumber(row.departmentId))
      .filter((value): value is number => value !== null);
    const managedDepartmentIds = managed.map((row) => asNumber(row.id));
    const keys = await this.permissionSetKeys(userId);
    const roles = rolesFromPermissionSets(
      keys,
      managedDepartmentIds.length > 0,
    );
    return {
      userId,
      name: user ? asString(user.name) : userId,
      roles,
      departmentIds,
      managedDepartmentIds,
    };
  }

  private async permissionSetKeys(userId: string): Promise<readonly string[]> {
    const permissionSets = this.options.authorization?.permissionSets;
    if (!permissionSets) return [];
    try {
      const assignments = await permissionSets.listAssignments();
      return assignments
        .filter(
          (assignment) =>
            assignment.subject.type === 'user' &&
            assignment.subject.id === userId,
        )
        .map((assignment) => assignment.permissionSet);
    } catch {
      return [];
    }
  }

  private async findClaim(claimId: number): Promise<Row> {
    const row = await this.options.database
      .query()
      .selectFrom('expenseClaims')
      .selectAll()
      .where('id', '=', claimId)
      .executeTakeFirst();
    if (!row)
      throw new ExpenseError('NOT_FOUND', 'Expense claim not found.', 404);
    return row;
  }

  private async requireClaim(claimId: number): Promise<Row> {
    return this.findClaim(claimId);
  }

  private assertVisible(claim: Row, viewer: Viewer): void {
    if (viewer.roles.has('admin') || viewer.roles.has('finance')) return;
    if (this.isApplicant(claim, viewer)) return;
    if (this.managesDepartment(claim, viewer)) return;
    throw new ExpenseError(
      'FORBIDDEN',
      'You do not have access to this claim.',
      403,
    );
  }

  private assertOwnership(claim: Row, viewer: Viewer): void {
    this.assertVisible(claim, viewer);
  }

  private isApplicant(claim: Row, viewer: Viewer): boolean {
    return asString(claim.applicantId) === viewer.userId;
  }

  private managesDepartment(claim: Row, viewer: Viewer): boolean {
    const departmentId = asNullableNumber(claim.departmentId);
    return (
      departmentId !== null &&
      viewer.managedDepartmentIds.includes(departmentId)
    );
  }

  private async enrichClaims(
    rows: readonly Row[],
    viewer: Viewer,
  ): Promise<ClaimRecord[]> {
    if (rows.length === 0) return [];
    const applicantIds = new Set(rows.map((row) => asString(row.applicantId)));
    const names = await this.userNames([...applicantIds]);
    const departmentRows = await this.options.database
      .query()
      .selectFrom('departments')
      .select(['id', 'name'])
      .execute();
    const departmentNames = new Map(
      departmentRows.map((row) => [asNumber(row.id), asString(row.name)]),
    );
    return rows.map((row) => {
      const departmentId = asNullableNumber(row.departmentId);
      const applicantId = asString(row.applicantId);
      const status = asString(row.status);
      const viewerManages =
        departmentId !== null &&
        viewer.managedDepartmentIds.includes(departmentId);
      return {
        id: asNumber(row.id),
        number: asString(row.number),
        applicantId,
        applicantName: names.get(applicantId) ?? applicantId,
        departmentId,
        departmentName:
          departmentId === null
            ? null
            : (departmentNames.get(departmentId) ?? null),
        reason: asString(row.reason),
        expenseDate: asString(row.expenseDate),
        totalCents: asNumber(row.totalCents),
        status,
        rejectReason: asNullableString(row.rejectReason),
        paymentDate: asNullableString(row.paymentDate),
        loanId: asNullableNumber(row.loanId),
        loanSummary: null,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        capabilities: claimCapabilities({
          status,
          viewer: viewer.roles,
          isApplicant: applicantId === viewer.userId,
          managesDepartment: viewerManages,
        }),
        items: [],
        attachments: [],
      };
    });
  }

  private async userNames(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.options.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .where('id', 'in', [...ids])
      .execute();
    return new Map(
      rows.map((row) => [
        asString(row.id),
        asString(row.name) || asString(row.username) || asString(row.id),
      ]),
    );
  }

  private async enrichLoans(
    rows: readonly Row[],
    viewer: Viewer,
  ): Promise<LoanRecord[]> {
    if (rows.length === 0) return [];
    const borrowerIds = rows.map((row) => asString(row.borrowerId));
    const names = await this.userNames(borrowerIds);
    const claimIds = rows
      .map((row) => asNullableNumber(row.settledByClaimId))
      .filter((value): value is number => value !== null);
    const claimNumbers = new Map<number, string>();
    if (claimIds.length) {
      const claims = await this.options.database
        .query()
        .selectFrom('expenseClaims')
        .select(['id', 'number'])
        .where('id', 'in', claimIds)
        .execute();
      for (const claim of claims) {
        claimNumbers.set(asNumber(claim.id), asString(claim.number));
      }
    }
    return rows.map((row) => {
      const borrowerId = asString(row.borrowerId);
      const settledBy = asNullableNumber(row.settledByClaimId);
      return {
        id: asNumber(row.id),
        borrowerId,
        borrowerName: names.get(borrowerId) ?? borrowerId,
        amountCents: asNumber(row.amountCents),
        loanDate: asString(row.loanDate),
        purpose: asNullableString(row.purpose),
        settled: row.settled === true || row.settled === 1,
        settledByClaimId: settledBy,
        settledByClaimNumber:
          settledBy === null ? null : (claimNumbers.get(settledBy) ?? null),
        settledAt: row.settledAt ? toIso(row.settledAt) : null,
        capabilities: {
          canSettle: borrowerId === viewer.userId || viewer.roles.has('admin'),
        },
      };
    });
  }

  private async resolveLoanForClaim(
    userId: string,
    viewer: Viewer,
    loanId: number | null,
    currentLoanId?: unknown,
  ): Promise<Row | null> {
    if (loanId === null) return null;
    const loan = await this.options.database
      .query()
      .selectFrom('loans')
      .selectAll()
      .where('id', '=', loanId)
      .executeTakeFirst();
    if (!loan)
      throw new ExpenseError('VALIDATION', 'The selected loan does not exist.');
    const alreadyLinked = asNullableNumber(currentLoanId) === loanId;
    const settled = loan.settled === true || loan.settled === 1;
    if (settled && !alreadyLinked) {
      throw new ExpenseError(
        'VALIDATION',
        'The selected loan has already been settled.',
      );
    }
    if (!viewer.roles.has('admin') && asString(loan.borrowerId) !== userId) {
      throw new ExpenseError(
        'FORBIDDEN',
        'You may only settle your own loan.',
        403,
      );
    }
    return loan;
  }

  private async assertDepartment(departmentId: number | null): Promise<void> {
    if (departmentId === null) return;
    const row = await this.options.database
      .query()
      .selectFrom('departments')
      .select('id')
      .where('id', '=', departmentId)
      .executeTakeFirst();
    if (!row)
      throw new ExpenseError(
        'VALIDATION',
        'The selected department does not exist.',
      );
  }

  private async assertFiles(fileIds: readonly string[]): Promise<void> {
    if (fileIds.length === 0) return;
    const rows = await this.options.database
      .query()
      .selectFrom('invoice_files')
      .select('id')
      .where('id', 'in', [...fileIds])
      .execute();
    if (rows.length !== new Set(fileIds).size) {
      throw new ExpenseError(
        'VALIDATION',
        'One or more attachments could not be found.',
      );
    }
  }

  private async nextClaimNumber(expenseDate: string): Promise<string> {
    const prefix = `BX-${expenseDate.replace(/-/g, '')}-`;
    const last = await this.options.database
      .query()
      .selectFrom('expenseClaims')
      .select('number')
      .where('number', 'like', `${prefix}%`)
      .orderBy('number', 'desc')
      .limit(1)
      .executeTakeFirst();
    const sequence = last
      ? Number(asString(last.number).slice(prefix.length)) + 1
      : 1;
    return formatClaimNumber(expenseDate, sequence);
  }

  private async replaceItems(
    query: QueryAdapter,
    claimId: number,
    items: readonly ExpenseItemInput[],
    now: Date,
  ): Promise<void> {
    await query
      .deleteFrom('expenseItems')
      .where('claimId', '=', claimId)
      .execute();
    if (items.length === 0) return;
    await query
      .insertInto('expenseItems')
      .values(
        items.map((item) => ({
          claimId,
          category: item.category,
          amountCents: item.amountCents,
          remark: item.remark ?? null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();
  }

  private async replaceAttachments(
    query: QueryAdapter,
    claimId: number,
    fileIds: readonly string[],
    now: Date,
  ): Promise<void> {
    await query
      .deleteFrom('expenseClaimAttachments')
      .where('claimId', '=', claimId)
      .execute();
    const unique = [...new Set(fileIds)];
    if (unique.length === 0) return;
    await query
      .insertInto('expenseClaimAttachments')
      .values(unique.map((fileId) => ({ claimId, fileId, createdAt: now })))
      .execute();
  }

  private async settleLoan(
    query: QueryAdapter,
    loanId: number,
    claimId: number,
    now: Date,
  ): Promise<void> {
    await query
      .updateTable('loans')
      .set({
        settled: true,
        settledByClaimId: claimId,
        settledAt: now,
        updatedAt: now,
      })
      .where('id', '=', loanId)
      .execute();
  }

  private async revertLoan(
    query: QueryAdapter,
    loanId: number | null,
    now: Date,
  ): Promise<void> {
    if (loanId === null) return;
    await query
      .updateTable('loans')
      .set({
        settled: false,
        settledByClaimId: null,
        settledAt: null,
        updatedAt: now,
      })
      .where('id', '=', loanId)
      .execute();
  }

  private async setStatus(
    claimId: number,
    status: string,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.options.database
      .query()
      .updateTable('expenseClaims')
      .set({ status, ...extra, updatedAt: new Date() })
      .where('id', '=', claimId)
      .execute();
  }

  private async loadItems(
    claimId: number,
  ): Promise<readonly ExpenseItemRecord[]> {
    const rows = await this.options.database
      .query()
      .selectFrom('expenseItems')
      .select(['id', 'category', 'amountCents', 'remark'])
      .where('claimId', '=', claimId)
      .orderBy('id', 'asc')
      .execute();
    return rows.map((row) => ({
      id: asNumber(row.id),
      category: asString(row.category),
      amountCents: asNumber(row.amountCents),
      remark: asNullableString(row.remark),
    }));
  }

  private async loadAttachments(
    claimId: number,
  ): Promise<readonly AttachmentRecord[]> {
    const links = await this.options.database
      .query()
      .selectFrom('expenseClaimAttachments')
      .select('fileId')
      .where('claimId', '=', claimId)
      .execute();
    const ids = links.map((link) => asString(link.fileId));
    if (ids.length === 0) return [];
    const files = await this.options.database
      .query()
      .selectFrom('invoice_files')
      .select(['id', 'filename', 'ext', 'mimeType', 'size'])
      .where('id', 'in', ids)
      .execute();
    return files.map((file) => {
      const id = asString(file.id);
      const ext = asString(file.ext);
      return {
        id,
        filename: asString(file.filename),
        ext,
        mimeType: asString(file.mimeType),
        size: asNumber(file.size),
        url: `/uploads/invoices/${id}${ext ? `.${ext}` : ''}`,
      };
    });
  }

  /** Loads items and attachments for a single claim; the list view deliberately skips this. */
  async hydrateClaim(userId: string, claimId: number): Promise<ClaimRecord> {
    const claim = await this.getClaim(userId, claimId);
    const [items, attachments] = await Promise.all([
      this.loadItems(claimId),
      this.loadAttachments(claimId),
    ]);
    let loanSummary: string | null = null;
    if (claim.loanId !== null) {
      const loan = await this.options.database
        .query()
        .selectFrom('loans')
        .select(['amountCents', 'loanDate'])
        .where('id', '=', claim.loanId)
        .executeTakeFirst();
      if (loan) {
        loanSummary = `${asString(loan.loanDate)} · ${asNumber(loan.amountCents)}`;
      }
    }
    return { ...claim, items, attachments, loanSummary };
  }
}

function mapToArray(
  map: ReadonlyMap<string, number>,
): { key: string; totalCents: number }[] {
  return [...map.entries()].map(([key, totalCents]) => ({ key, totalCents }));
}

function asNumber(value: unknown): number {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : 0;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return '';
}

function asNullableString(value: unknown): string | null {
  const text = asString(value);
  return text === '' ? null : text;
}

function asNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return asString(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}
