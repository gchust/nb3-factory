import { randomUUID } from 'node:crypto';
import { setImmediate as yieldImmediate } from 'node:timers/promises';

import { ExpenseError } from './errors.js';
import {
  buildClaimNo,
  buildExportCsv,
  claimCapabilities,
  computeTotalAmount,
  displayUserName,
  evaluateAction,
  exportJobProgress,
  isPaymentMethod,
  managesDepartment,
  resolveActor,
  toAmount,
  toExportRows,
  toIsoDate,
  type Actor,
} from './logic.js';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  MAX_CLAIM_PAGE_SIZE,
  type ApprovalRecord,
  type ClaimCapabilities,
  type ClaimRecord,
  type DepartmentRecord,
  type ExpenseAction,
  type ExpenseStatus,
  type ExportJobRecord,
  type ExportRow,
  type ItemRecord,
} from './model.js';
import type { ClaimQuery, ExpenseStore, ItemWriteValues } from './store.js';

/** The signed-in user, as the authentication layer knows them. */
export interface ExpenseUser {
  readonly id: string;
  readonly name?: string | null;
  readonly nickname?: string | null;
}

export interface ExpenseItemInput {
  readonly category: string;
  readonly amount: number;
  readonly expenseDate?: string | null;
  readonly description?: string | null;
  readonly invoiceId?: string | null;
  readonly invoiceName?: string | null;
  readonly invoiceExt?: string | null;
  readonly invoiceType?: string | null;
}

export interface ClaimInput {
  readonly title: string;
  readonly departmentId?: string | null;
  readonly remark?: string | null;
  readonly items: readonly ExpenseItemInput[];
}

export interface ExpenseListQuery {
  readonly statuses?: readonly ExpenseStatus[];
  readonly departmentIds?: readonly string[];
  readonly applicantIds?: readonly string[];
  readonly keyword?: string;
  readonly submittedFrom?: string | null;
  readonly submittedTo?: string | null;
  readonly limit?: number;
  readonly offset?: number;
  readonly sort?: 'createdAt' | 'submittedAt' | 'totalAmount';
  readonly order?: 'asc' | 'desc';
}

export interface ClaimListView extends ClaimRecord {
  readonly capabilities: ClaimCapabilities;
  readonly itemCount: number;
}

export interface ClaimDetailView {
  readonly claim: ClaimRecord;
  readonly items: readonly ItemRecord[];
  readonly approvals: readonly ApprovalRecord[];
  readonly capabilities: ClaimCapabilities;
}

export interface ExpenseStatsBucket {
  readonly count: number;
  readonly totalAmount: number;
  readonly paidAmount: number;
}

export interface ExpenseStats {
  readonly totals: ExpenseStatsBucket & {
    readonly pendingAmount: number;
    readonly rejectedCount: number;
  };
  readonly byMonth: readonly ({
    readonly month: string;
  } & ExpenseStatsBucket)[];
  readonly byDepartment: readonly ({
    readonly departmentId: string | null;
    readonly departmentName: string;
  } & ExpenseStatsBucket)[];
  readonly byStatus: readonly ({
    readonly status: ExpenseStatus;
  } & ExpenseStatsBucket)[];
}

export interface ExportJobView {
  readonly id: string;
  readonly status: ExportJobRecord['status'];
  readonly total: number;
  readonly processed: number;
  readonly progress: number;
  readonly resultFilename: string | null;
  readonly resultSize: number;
  readonly error: string | null;
  readonly filter: string | null;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly createdAt: Date | null;
}

export interface ExportContentView {
  readonly filename: string;
  readonly content: string;
}

/**
 * The reimbursement workflow.
 *
 * Every page reads its permissions from this service rather than from registered authorization actions: who may see a
 * claim, and what they may do to it, depends on the claim's own department and stage, which is business data, not a
 * static role. The capability flags it returns are computed by the same function the transitions consult, so the
 * buttons the pages render and the moves the server accepts cannot disagree.
 */
export class ExpenseService {
  private readonly runningExports = new Set<string>();

  constructor(private readonly store: ExpenseStore) {}

  // --- actors ------------------------------------------------------------------------------------------------

  /** Load the departments and memberships one actor's visibility depends on. */
  async actorFor(user: ExpenseUser | string, name?: string): Promise<Actor> {
    const userId = typeof user === 'string' ? user : user.id;
    const fallbackName =
      typeof user === 'string'
        ? (name ?? user)
        : displayUserName(user, user.id);
    const [departments, memberDepartmentIds] = await Promise.all([
      this.store.listDepartments(),
      this.store.listMemberDepartmentIds(userId),
    ]);
    return resolveActor(departments, memberDepartmentIds, userId, fallbackName);
  }

  // --- reads -------------------------------------------------------------------------------------------------

  /** The department tree the claim form offers; the same list the actor was resolved against. */
  async listDepartments(): Promise<DepartmentRecord[]> {
    return this.store.listDepartments();
  }

  async listClaims(
    actor: Actor,
    query: ExpenseListQuery,
  ): Promise<{ readonly rows: ClaimListView[]; readonly total: number }> {
    const normalized = normalizeListQuery(query);
    const scoped = this.applyScope(actor, normalized);
    const [rows, total] = await Promise.all([
      this.store.listClaims(scoped),
      this.store.countClaims(scoped),
    ]);
    const items = await this.store.listItemsForClaims(
      rows.map((row) => row.id),
    );
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.claimId, (counts.get(item.claimId) ?? 0) + 1);
    }
    return {
      rows: rows.map((claim) => ({
        ...claim,
        capabilities: claimCapabilities(claim, actor),
        itemCount: counts.get(claim.id) ?? 0,
      })),
      total,
    };
  }

  async getClaim(actor: Actor, id: string): Promise<ClaimDetailView> {
    const claim = await this.store.findClaim(id);
    if (!claim) {
      throw new ExpenseError('not_found', 'Claim not found');
    }
    const capabilities = claimCapabilities(claim, actor);
    if (!capabilities.canView) {
      // A claim the actor may not see is indistinguishable from one that does not exist.
      throw new ExpenseError('not_found', 'Claim not found');
    }
    const [items, approvals] = await Promise.all([
      this.store.listItems(id),
      this.store.listApprovals(id),
    ]);
    return { claim, items, approvals, capabilities };
  }

  async stats(
    actor: Actor,
    query: ExpenseListQuery = {},
  ): Promise<ExpenseStats> {
    const claims = await this.store.listClaims({
      ...this.applyScope(actor, normalizeListQuery(query)),
      sort: 'submittedAt',
      order: 'asc',
    });
    return summarizeStats(claims);
  }
  // --- writes ------------------------------------------------------------------------------------------------

  async createClaim(actor: Actor, input: ClaimInput): Promise<ClaimDetailView> {
    const title = (input.title ?? '').trim();
    if (!title) {
      throw new ExpenseError('validation', 'A purpose is required', {
        field: 'title',
      });
    }
    const items = validateItems(input.items);
    const department = await this.resolveDepartment(
      actor,
      input.departmentId ?? null,
    );
    const now = new Date();
    const claim = await this.store.insertClaim({
      claimNo: buildClaimNo(now, randomUUID()),
      title,
      applicantId: actor.userId,
      applicantName: actor.userName,
      departmentId: department.id,
      departmentName: department.name,
      status: 'draft',
      totalAmount: computeTotalAmount(items),
      remark: emptyToNull(input.remark),
      submittedAt: null,
      decidedAt: null,
      paidAt: null,
      paymentMethod: null,
      paymentRemark: null,
    });
    await this.store.replaceItems(claim.id, items);
    return this.getClaim(actor, claim.id);
  }

  async updateClaim(
    actor: Actor,
    id: string,
    input: ClaimInput,
  ): Promise<ClaimDetailView> {
    const claim = await this.requireEditableClaim(actor, id);
    const title = (input.title ?? '').trim();
    if (!title) {
      throw new ExpenseError('validation', 'A purpose is required', {
        field: 'title',
      });
    }
    const items = validateItems(input.items);
    const department = await this.resolveDepartment(
      actor,
      input.departmentId ?? claim.departmentId,
    );
    await this.store.replaceItems(claim.id, items);
    await this.store.updateClaim(claim.id, {
      title,
      remark: emptyToNull(input.remark),
      departmentId: department.id,
      departmentName: department.name,
      // The client never supplies the total; it is derived from the lines that were just written.
      totalAmount: computeTotalAmount(items),
    });
    return this.getClaim(actor, id);
  }

  async deleteClaim(actor: Actor, id: string): Promise<void> {
    const claim = await this.store.findClaim(id);
    if (!claim) {
      throw new ExpenseError('not_found', 'Claim not found');
    }
    const capabilities = claimCapabilities(claim, actor);
    if (!capabilities.canDelete) {
      throw new ExpenseError(
        capabilities.canView ? 'invalid_status' : 'not_found',
        'This claim cannot be deleted',
      );
    }
    await this.store.deleteClaim(id);
  }

  /**
   * Perform one workflow action.
   *
   * The status is part of the update filter, so a second reviewer acting on a claim that already moved loses the race
   * and is told so instead of overwriting the first decision.
   */
  async act(
    actor: Actor,
    id: string,
    action: ExpenseAction,
    payload: {
      comment?: string | null;
      paymentMethod?: string | null;
      paymentRemark?: string | null;
    } = {},
  ): Promise<ClaimDetailView> {
    const claim = await this.store.findClaim(id);
    if (!claim) {
      throw new ExpenseError('not_found', 'Claim not found');
    }
    const capabilities = claimCapabilities(claim, actor);
    if (!capabilities.canView) {
      throw new ExpenseError('not_found', 'Claim not found');
    }
    const items = action === 'submit' ? await this.store.listItems(id) : [];
    const hasItems =
      action === 'submit'
        ? items.some((item) => toAmount(item.amount) > 0)
        : true;
    const result = evaluateAction({
      action,
      claim,
      actor,
      capabilities,
      hasItems,
      comment: payload.comment,
    });
    if (!result.ok) {
      throw new ExpenseError(
        result.reason,
        transitionMessage(result.reason, action),
      );
    }
    if (action === 'pay') {
      const method = (payload.paymentMethod ?? '').trim();
      if (!isPaymentMethod(method)) {
        throw new ExpenseError(
          'invalid_payment_method',
          'Choose a payment method',
        );
      }
    }

    const now = new Date();
    const values: Record<string, unknown> = { status: result.toStatus };
    if (action === 'submit') {
      values.submittedAt = now;
      values.decidedAt = null;
      values.paidAt = null;
      values.paymentMethod = null;
      values.paymentRemark = null;
    } else if (action === 'approve') {
      if (result.toStatus === 'approved') {
        values.decidedAt = now;
      }
    } else if (action === 'reject') {
      values.decidedAt = now;
    } else if (action === 'pay') {
      values.paidAt = now;
      values.paymentMethod = (payload.paymentMethod ?? '').trim();
      values.paymentRemark = emptyToNull(payload.paymentRemark);
    }

    const applied = await this.store.updateClaimIfStatus(
      id,
      claim.status,
      values,
    );
    if (!applied) {
      throw new ExpenseError(
        'conflict',
        'The claim changed while you were reviewing it',
      );
    }
    await this.store.insertApproval({
      claimId: id,
      action,
      operatorId: actor.userId,
      operatorName: actor.userName,
      fromStatus: claim.status,
      toStatus: result.toStatus,
      comment: emptyToNull(payload.comment),
    });
    return this.getClaim(actor, id);
  }

  // --- batch export ------------------------------------------------------------------------------------------

  /**
   * Start an export and return immediately.
   *
   * The work runs in the background so the user can keep working; the page polls the returned job. The filter is
   * snapshotted onto the job and re-scoped when the job runs, so a stored job can never widen a requester's access.
   */
  async startExport(
    actor: Actor,
    filter: ExpenseListQuery = {},
  ): Promise<ExportJobView> {
    const snapshot = snapshotExportFilter(filter);
    const job = await this.store.insertExportJob({
      requesterId: actor.userId,
      status: 'pending',
      filter: JSON.stringify(snapshot),
      total: 0,
      processed: 0,
      resultFilename: null,
      resultContent: null,
      resultSize: 0,
      error: null,
      startedAt: null,
      finishedAt: null,
    });
    this.launchExport(job.id);
    return toExportView(job);
  }

  async listExports(actor: Actor): Promise<ExportJobView[]> {
    const jobs = await this.store.listExportJobs(actor.userId);
    return jobs.map(toExportView);
  }

  async getExport(actor: Actor, id: string): Promise<ExportJobView> {
    return toExportView(await this.requireExportJob(actor, id));
  }

  async getExportContent(actor: Actor, id: string): Promise<ExportContentView> {
    const job = await this.requireExportJob(actor, id);
    if (job.status !== 'completed' || !job.resultContent) {
      throw new ExpenseError('invalid_status', 'The export is not ready yet');
    }
    return {
      filename: job.resultFilename ?? `expenses-${id}.csv`,
      content: job.resultContent,
    };
  }

  /** Re-run jobs left behind by a restart; called once when the provider starts. */
  async resumePendingExports(): Promise<number> {
    const jobs = await this.store.listUnfinishedExportJobs();
    for (const job of jobs) {
      this.launchExport(job.id);
    }
    return jobs.length;
  }

  private launchExport(jobId: string): void {
    if (this.runningExports.has(jobId)) {
      return;
    }
    this.runningExports.add(jobId);
    void this.runExportJob(jobId)
      .catch(() => undefined)
      .finally(() => this.runningExports.delete(jobId));
  }

  private async runExportJob(jobId: string): Promise<void> {
    const job = await this.store.findExportJob(jobId);
    if (!job || job.status === 'completed') {
      return;
    }
    await this.store.updateExportJob(jobId, {
      status: 'running',
      startedAt: new Date(),
      error: null,
    });
    try {
      const actor = await this.actorFor(job.requesterId);
      const filter = parseExportFilter(job.filter);
      const claims = await this.store.listClaims({
        ...this.applyScope(actor, filter),
        sort: 'submittedAt',
        order: 'asc',
      });
      await this.store.updateExportJob(jobId, { total: claims.length });
      const rows: ExportRow[] = [];
      let processed = 0;
      for (const claim of claims) {
        const [items, approvals] = await Promise.all([
          this.store.listItems(claim.id),
          this.store.listApprovals(claim.id),
        ]);
        rows.push(...toExportRows(claim, items, approvals));
        processed += 1;
        await this.store.updateExportJob(jobId, { processed });
        // Let a polling request through between claims so progress is observable and the server stays responsive.
        await yieldImmediate();
      }
      const content = buildExportCsv(rows);
      await this.store.updateExportJob(jobId, {
        status: 'completed',
        processed: claims.length,
        resultContent: content,
        resultFilename: `expenses-${new Date().toISOString().slice(0, 10)}.csv`,
        resultSize: Buffer.byteLength(content, 'utf8'),
        finishedAt: new Date(),
      });
    } catch (error) {
      await this.store.updateExportJob(jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      });
    }
  }

  private async requireExportJob(
    actor: Actor,
    id: string,
  ): Promise<ExportJobRecord> {
    const job = await this.store.findExportJob(id);
    if (!job || job.requesterId !== actor.userId) {
      throw new ExpenseError('not_found', 'Export not found');
    }
    return job;
  }

  // --- internals ---------------------------------------------------------------------------------------------

  /**
   * Narrow a query to the claims an actor may see.
   *
   * Finance sees everything. Everyone else sees their own claims plus those filed in a department they supervise —
   * an ancestor's manager supervises its descendants, which `managesDepartment` covers while walking up.
   */
  private applyScope(actor: Actor, query: ExpenseListQuery): ClaimQuery {
    if (actor.isFinance) {
      return { ...query };
    }
    const managedDepartmentIds = actor.departments
      .filter((department) =>
        managesDepartment(actor.departments, actor.userId, department.id),
      )
      .map((department) => department.id);
    return {
      ...query,
      scope: { userId: actor.userId, departmentIds: managedDepartmentIds },
    };
  }

  private async requireEditableClaim(
    actor: Actor,
    id: string,
  ): Promise<ClaimRecord> {
    const claim = await this.store.findClaim(id);
    if (!claim) {
      throw new ExpenseError('not_found', 'Claim not found');
    }
    const capabilities = claimCapabilities(claim, actor);
    if (!capabilities.canView) {
      throw new ExpenseError('not_found', 'Claim not found');
    }
    if (!capabilities.canEdit) {
      throw new ExpenseError(
        'invalid_status',
        'This claim can no longer be edited; only a draft or a rejected claim can be changed',
      );
    }
    return claim;
  }

  private async resolveDepartment(
    actor: Actor,
    requestedId: string | null,
  ): Promise<{ readonly id: string | null; readonly name: string | null }> {
    if (requestedId) {
      const department = actor.departments.find(
        (candidate) => candidate.id === requestedId,
      );
      if (!department) {
        throw new ExpenseError('validation', 'Unknown department', {
          field: 'departmentId',
        });
      }
      const allowed =
        actor.isFinance ||
        actor.memberDepartmentIds.includes(department.id) ||
        managesDepartment(actor.departments, actor.userId, department.id);
      if (!allowed) {
        throw new ExpenseError(
          'forbidden',
          'You cannot file a claim for that department',
        );
      }
      return { id: department.id, name: department.name };
    }
    const own = actor.memberDepartmentIds
      .map((departmentId) =>
        actor.departments.find((candidate) => candidate.id === departmentId),
      )
      .find((candidate) => candidate !== undefined);
    return own ? { id: own.id, name: own.name } : { id: null, name: null };
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

function transitionMessage(reason: string, action: ExpenseAction): string {
  switch (reason) {
    case 'forbidden':
      return `You are not allowed to ${action} this claim`;
    case 'empty_claim':
      return 'Add at least one expense line before submitting';
    case 'comment_required':
      return 'A reason is required when rejecting a claim';
    default:
      return 'The claim is not in a state that allows this action';
  }
}

/** Validate the lines of a claim; the server never trusts a client-computed total. */
export function validateItems(
  items: readonly ExpenseItemInput[] | undefined,
): ItemWriteValues[] {
  if (!Array.isArray(items)) {
    throw new ExpenseError('validation', 'Expense lines are required', {
      field: 'items',
    });
  }
  // `Array.isArray` narrows to `any[]`, which would make every field read below unsafe. Re-typing the value restores the
  // declared line shape without an assertion at each access.
  const lines: readonly ExpenseItemInput[] = items;
  return lines.map((item, index) => {
    const category = (item?.category ?? '').trim();
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
      throw new ExpenseError(
        'validation',
        `Unknown expense category: ${category || '(empty)'}`,
        {
          field: `items.${index}.category`,
        },
      );
    }
    const amount = toAmount(item?.amount);
    if (!(amount > 0)) {
      throw new ExpenseError(
        'validation',
        'Each expense line needs an amount greater than zero',
        {
          field: `items.${index}.amount`,
        },
      );
    }
    return {
      category,
      amount,
      expenseDate: item.expenseDate ? toIsoDate(item.expenseDate) : null,
      description: emptyToNull(item.description ?? null),
      invoiceId: emptyToNull(item.invoiceId ?? null),
      invoiceName: emptyToNull(item.invoiceName ?? null),
      invoiceExt: emptyToNull(item.invoiceExt ?? null),
      invoiceType: emptyToNull(item.invoiceType ?? null),
      sortOrder: index,
    };
  });
}

export function normalizeListQuery(query: ExpenseListQuery): ExpenseListQuery {
  const limit =
    query.limit === undefined
      ? 20
      : Math.min(Math.max(1, Math.trunc(query.limit)), MAX_CLAIM_PAGE_SIZE);
  const offset =
    query.offset === undefined ? 0 : Math.max(0, Math.trunc(query.offset));
  const statuses = (query.statuses ?? []).filter(
    (status): status is ExpenseStatus =>
      (EXPENSE_STATUSES as readonly string[]).includes(status),
  );
  return {
    ...query,
    statuses: statuses.length ? statuses : undefined,
    limit,
    offset,
    sort: query.sort ?? 'createdAt',
    order: query.order === 'asc' ? 'asc' : 'desc',
  };
}

/** Only the fields an export may carry into the background; the applicant scope is never part of it. */
export function snapshotExportFilter(
  query: ExpenseListQuery,
): ExpenseListQuery {
  const normalized = normalizeListQuery(query);
  return {
    statuses: normalized.statuses,
    departmentIds: normalized.departmentIds?.length
      ? normalized.departmentIds
      : undefined,
    keyword: normalized.keyword?.trim() || undefined,
    submittedFrom: normalized.submittedFrom || undefined,
    submittedTo: normalized.submittedTo || undefined,
    sort: 'submittedAt',
    order: 'asc',
  };
}

export function parseExportFilter(raw: string | null): ExpenseListQuery {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as ExpenseListQuery;
    return snapshotExportFilter(parsed);
  } catch {
    return {};
  }
}

export function toExportView(job: ExportJobRecord): ExportJobView {
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    progress: exportJobProgress(job),
    resultFilename: job.resultFilename,
    resultSize: job.resultSize,
    error: job.error,
    filter: job.filter,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
  };
}

/** Aggregate a scoped set of claims into the dashboard's buckets. */
export function summarizeStats(claims: readonly ClaimRecord[]): ExpenseStats {
  const byMonth = new Map<
    string,
    { count: number; totalAmount: number; paidAmount: number }
  >();
  const byDepartment = new Map<
    string,
    {
      departmentId: string | null;
      departmentName: string;
      count: number;
      totalAmount: number;
      paidAmount: number;
    }
  >();
  const byStatus = new Map<
    ExpenseStatus,
    { count: number; totalAmount: number; paidAmount: number }
  >();
  let totalAmount = 0;
  let paidAmount = 0;
  let pendingAmount = 0;
  let rejectedCount = 0;

  for (const claim of claims) {
    const amount = toAmount(claim.totalAmount);
    const paid = claim.status === 'paid' ? amount : 0;
    totalAmount += amount;
    paidAmount += paid;
    if (
      claim.status === 'pending_supervisor' ||
      claim.status === 'pending_finance' ||
      claim.status === 'approved'
    ) {
      pendingAmount += amount;
    }
    if (claim.status === 'rejected') {
      rejectedCount += 1;
    }

    const month =
      (toIsoDate(claim.submittedAt ?? claim.createdAt) ?? '').slice(0, 7) ||
      'unknown';
    const monthBucket = byMonth.get(month) ?? {
      count: 0,
      totalAmount: 0,
      paidAmount: 0,
    };
    monthBucket.count += 1;
    monthBucket.totalAmount += amount;
    monthBucket.paidAmount += paid;
    byMonth.set(month, monthBucket);

    const departmentKey = claim.departmentId ?? '__none__';
    const departmentBucket = byDepartment.get(departmentKey) ?? {
      departmentId: claim.departmentId,
      departmentName: claim.departmentName ?? '—',
      count: 0,
      totalAmount: 0,
      paidAmount: 0,
    };
    departmentBucket.count += 1;
    departmentBucket.totalAmount += amount;
    departmentBucket.paidAmount += paid;
    byDepartment.set(departmentKey, departmentBucket);

    const statusBucket = byStatus.get(claim.status) ?? {
      count: 0,
      totalAmount: 0,
      paidAmount: 0,
    };
    statusBucket.count += 1;
    statusBucket.totalAmount += amount;
    statusBucket.paidAmount += paid;
    byStatus.set(claim.status, statusBucket);
  }

  return {
    totals: {
      count: claims.length,
      totalAmount,
      paidAmount,
      pendingAmount,
      rejectedCount,
    },
    byMonth: [...byMonth.entries()]
      .map(([month, bucket]) => ({ month, ...bucket }))
      .sort((left, right) => left.month.localeCompare(right.month)),
    byDepartment: [...byDepartment.values()].sort(
      (left, right) => right.totalAmount - left.totalAmount,
    ),
    byStatus: EXPENSE_STATUSES.map((status) => ({
      status,
      ...(byStatus.get(status) ?? { count: 0, totalAmount: 0, paidAmount: 0 }),
    })),
  };
}
