import {
  EDITABLE_STATUSES,
  EXPENSE_PAYMENT_METHODS,
  FINANCE_DEPARTMENT_CODE,
  FINANCE_REVIEW_THRESHOLD,
  type ActorRole,
  type ApprovalRecord,
  type ClaimCapabilities,
  type ClaimRecord,
  type DepartmentRecord,
  type ExportJobRecord,
  type ExpenseAction,
  type ExpenseStatus,
  type ExportRow,
  type ItemRecord,
} from './model.js';

/** Round to cents so a float sum never leaks a fractional fen into an amount column. */
export function roundAmount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Amounts arrive as `string` from some drivers and `number` from others. */
export function toAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? roundAmount(parsed) : 0;
}

/** The server always recomputes the total; a value sent by the client is never trusted. */
export function computeTotalAmount(
  items: readonly { amount: number | string | null | undefined }[],
): number {
  return roundAmount(
    items.reduce((sum, item) => sum + toAmount(item.amount), 0),
  );
}

/** A claim strictly above the threshold needs the finance review step. */
export function requiresFinanceReview(totalAmount: number): boolean {
  return roundAmount(totalAmount) > FINANCE_REVIEW_THRESHOLD;
}

/** The acting user's relationship to one claim. */
export interface Actor {
  readonly userId: string;
  readonly userName: string;
  /** A member of the finance department sees and pays every claim. */
  readonly isFinance: boolean;
  /** Departments the actor belongs to directly. */
  readonly memberDepartmentIds: readonly string[];
  /** Every department, used to walk management up the hierarchy. */
  readonly departments: readonly DepartmentRecord[];
}

/** Build an actor from the raw rows the store returns. */
export function resolveActor(
  departments: readonly DepartmentRecord[],
  membershipDepartmentIds: readonly string[],
  userId: string,
  userName: string,
): Actor {
  const memberSet = new Set(membershipDepartmentIds);
  const isFinance = departments.some(
    (department) =>
      department.active &&
      department.code === FINANCE_DEPARTMENT_CODE &&
      memberSet.has(department.id),
  );
  return {
    userId,
    userName,
    isFinance,
    memberDepartmentIds: [...memberSet],
    departments,
  };
}

/**
 * Whether the actor supervises a department, directly or higher up the hierarchy.
 *
 * Walking ancestors covers descendants for free: a claim in a sub-department is managed by whoever manages any of its
 * ancestors. A user never approves their own claim, so the applicant is excluded by `claimCapabilities`.
 */
export function managesDepartment(
  departments: readonly DepartmentRecord[],
  userId: string,
  departmentId: string | null | undefined,
): boolean {
  if (!departmentId) {
    return false;
  }
  const byId = new Map(
    departments.map((department) => [department.id, department]),
  );
  const visited = new Set<string>();
  let current: string | null = departmentId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const department = byId.get(current);
    if (!department) {
      return false;
    }
    if (department.managerId && department.managerId === userId) {
      return true;
    }
    current = department.parentId;
  }
  return false;
}

/** Whether the actor may open this claim at all. */
export function canViewClaim(claim: ClaimRecord, actor: Actor): boolean {
  if (actor.isFinance) {
    return true;
  }
  if (claim.applicantId === actor.userId) {
    return true;
  }
  return managesDepartment(actor.departments, actor.userId, claim.departmentId);
}

/** What the actor is allowed to do with one claim, and what the detail page may render. */
export function claimCapabilities(
  claim: ClaimRecord,
  actor: Actor,
): ClaimCapabilities {
  const canView = canViewClaim(claim, actor);
  const isOwner = claim.applicantId === actor.userId;
  const isManager =
    !isOwner &&
    managesDepartment(actor.departments, actor.userId, claim.departmentId);
  const editable = (EDITABLE_STATUSES as readonly string[]).includes(
    claim.status,
  );
  const isSupervisorStage = claim.status === 'pending_supervisor';
  const isFinanceStage = claim.status === 'pending_finance';
  return {
    canView,
    canEdit: canView && isOwner && editable,
    canDelete: canView && isOwner && claim.status === 'draft',
    canSubmit: canView && isOwner && editable,
    canApprove:
      (isSupervisorStage && isManager) || (isFinanceStage && actor.isFinance),
    canReject:
      (isSupervisorStage && isManager) || (isFinanceStage && actor.isFinance),
    canPay: claim.status === 'approved' && actor.isFinance,
  };
}

/** The reason a transition was refused, so the route can pick an HTTP status and a message key. */
export type TransitionFailure =
  'forbidden' | 'invalid_status' | 'empty_claim' | 'comment_required';

export type TransitionResult =
  | { readonly ok: true; readonly toStatus: ExpenseStatus }
  | { readonly ok: false; readonly reason: TransitionFailure };

/**
 * Resolve what an action does to a claim.
 *
 * The capability flags are the single source of truth for permission; this function only maps a permitted action to
 * its target state, so the button the client shows and the transition the server accepts cannot drift apart.
 */
export function evaluateAction(input: {
  readonly action: ExpenseAction;
  readonly claim: ClaimRecord;
  readonly actor: Actor;
  readonly capabilities: ClaimCapabilities;
  readonly hasItems?: boolean;
  readonly comment?: string | null;
}): TransitionResult {
  const { action, claim, capabilities, hasItems = true, comment } = input;
  switch (action) {
    case 'submit':
      if (!capabilities.canSubmit) {
        return { ok: false, reason: 'forbidden' };
      }
      if (!hasItems) {
        return { ok: false, reason: 'empty_claim' };
      }
      return { ok: true, toStatus: 'pending_supervisor' };
    case 'approve':
      if (!capabilities.canApprove) {
        return { ok: false, reason: 'forbidden' };
      }
      if (
        claim.status === 'pending_supervisor' &&
        requiresFinanceReview(claim.totalAmount)
      ) {
        return { ok: true, toStatus: 'pending_finance' };
      }
      return { ok: true, toStatus: 'approved' };
    case 'reject':
      if (!capabilities.canReject) {
        return { ok: false, reason: 'forbidden' };
      }
      if (!comment || !comment.trim()) {
        return { ok: false, reason: 'comment_required' };
      }
      return { ok: true, toStatus: 'rejected' };
    case 'pay':
      if (!capabilities.canPay) {
        return { ok: false, reason: 'forbidden' };
      }
      return { ok: true, toStatus: 'paid' };
    default:
      return { ok: false, reason: 'invalid_status' };
  }
}

/** Which stage of the workflow the actor is answering at, used to label the approval record. */
export function actorRole(
  claim: ClaimRecord,
  actor: Actor,
  capabilities: ClaimCapabilities,
): ActorRole {
  if (claim.applicantId === actor.userId) {
    return 'owner';
  }
  if (capabilities.canApprove || capabilities.canReject) {
    return claim.status === 'pending_finance' ? 'finance' : 'supervisor';
  }
  if (actor.isFinance) {
    return 'finance';
  }
  return 'supervisor';
}

/** `EX` + date + a short random suffix, unique enough for a human-facing claim number. */
export function buildClaimNo(now: Date, randomSuffix: string): string {
  const year = now.getUTCFullYear();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${now.getUTCDate()}`.padStart(2, '0');
  const suffix = randomSuffix
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6)
    .padEnd(6, '0');
  return `EX${year}${month}${day}${suffix}`;
}

/** A `Date` column rendered as `YYYY-MM-DD`, or `null` when unset. */
export function toIsoDate(
  value: Date | string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** A `Date` column rendered as a full ISO timestamp, or `null` when unset. */
export function toIsoDateTime(
  value: Date | string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

/** One CSV cell, quoted only when it has to be. */
export function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const EXPORT_HEADERS = [
  '报销单号 Claim No',
  '用途 Purpose',
  '申请人 Applicant',
  '部门 Department',
  '状态 Status',
  '单据金额 Total',
  '费用类别 Category',
  '费用金额 Amount',
  '费用日期 Expense Date',
  '说明 Description',
  '发票 Invoice',
  '提交时间 Submitted At',
  '付款时间 Paid At',
  '审批记录 Approvals',
];

/** Build the CSV an export job delivers. A UTF-8 BOM keeps Excel from mangling Chinese. */
export function buildExportCsv(rows: readonly ExportRow[]): string {
  const lines = [EXPORT_HEADERS.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.claimNo,
        row.title,
        row.applicantName,
        row.departmentName,
        row.status,
        row.totalAmount.toFixed(2),
        row.category,
        row.amount.toFixed(2),
        row.expenseDate,
        row.description,
        row.invoiceName,
        row.submittedAt,
        row.paidAt,
        row.approvalSummary,
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

/** A one-line rendering of the approval history for an export row. */
export function summarizeApprovals(
  approvals: readonly ApprovalRecord[],
): string {
  return approvals
    .map(
      (approval) =>
        `${approval.action}:${approval.operatorName}${approval.comment ? `(${approval.comment})` : ''}`,
    )
    .join(' | ');
}

/** Flatten a claim and its items into the export rows. */
export function toExportRows(
  claim: ClaimRecord,
  items: readonly ItemRecord[],
  approvals: readonly ApprovalRecord[],
): ExportRow[] {
  const approvalSummary = summarizeApprovals(approvals);
  const lines = items.length
    ? items
    : [
        {
          category: '',
          amount: 0,
          expenseDate: null,
          description: null,
          invoiceName: null,
        },
      ];
  return lines.map((item) => ({
    claimNo: claim.claimNo,
    title: claim.title,
    applicantName: claim.applicantName,
    departmentName: claim.departmentName,
    status: claim.status,
    totalAmount: claim.totalAmount,
    category: item.category,
    amount: toAmount(item.amount),
    expenseDate: toIsoDate(item.expenseDate),
    description: item.description,
    invoiceName: item.invoiceName,
    submittedAt: toIsoDateTime(claim.submittedAt),
    paidAt: toIsoDateTime(claim.paidAt),
    approvalSummary,
  }));
}

/** Progress of an export job as the client renders it. */
export function exportJobProgress(job: ExportJobRecord): number {
  if (job.status === 'completed') {
    return 100;
  }
  if (!job.total || job.total <= 0) {
    return job.status === 'running' ? 5 : 0;
  }
  return Math.min(
    99,
    Math.max(0, Math.round((job.processed / job.total) * 100)),
  );
}

/** Whether a payment method is one the application offers. */
export function isPaymentMethod(value: string): boolean {
  return (EXPENSE_PAYMENT_METHODS as readonly string[]).includes(value);
}

/** A stable display name for a user, falling back to the id when the directory has nothing better. */
export function displayUserName(
  user: { name?: string | null; nickname?: string | null } | undefined,
  fallback: string,
): string {
  const candidate = user?.nickname?.trim() || user?.name?.trim();
  return candidate || fallback;
}
