/**
 * Pure domain rules for the expense reimbursement system.
 *
 * Everything here is free of database and HTTP concerns so the business rules — totals, validation, status
 * transitions, role capabilities and statistics shaping — can be tested directly. The service and the routes apply
 * these rules; they do not re-implement them.
 */

export const EXPENSE_CATEGORIES = [
  'travel',
  'transport',
  'meal',
  'office',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_STATUSES = [
  'pending',
  'approved',
  'pending_payment',
  'paid',
  'rejected',
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_ROLES = [
  'admin',
  'finance',
  'manager',
  'employee',
] as const;
export type ExpenseRole = (typeof EXPENSE_ROLES)[number];

export const SYSTEM_ADMINISTRATOR = 'system-administrator';
export const FINANCE_PERMISSION_SET = 'expense-finance';
export const MANAGER_PERMISSION_SET = 'expense-manager';
export const EMPLOYEE_PERMISSION_SET = 'expense-employee';

export interface ExpenseItemInput {
  readonly category: string;
  readonly amountCents: number;
  readonly remark?: string | null;
}

export interface ClaimInput {
  readonly reason?: unknown;
  readonly departmentId?: unknown;
  readonly expenseDate?: unknown;
  readonly loanId?: unknown;
  readonly fileIds?: unknown;
  readonly items?: unknown;
}

export interface NormalizedClaimInput {
  readonly reason: string;
  readonly departmentId: number | null;
  readonly expenseDate: string;
  readonly loanId: number | null;
  readonly fileIds: readonly string[];
  readonly items: readonly ExpenseItemInput[];
}

export class ExpenseError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ExpenseError';
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return (
    typeof value === 'string' &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function computeTotalCents(items: readonly ExpenseItemInput[]): number {
  return items.reduce((total, item) => total + item.amountCents, 0);
}

/** The statuses whose amount and item list may still change. */
export function isEditableStatus(status: string): boolean {
  return status === 'pending' || status === 'rejected';
}

/**
 * Normalizes and validates a claim payload.
 *
 * The total is never accepted from the client — it is always derived from the items — and a claim must carry at least
 * one item. Numbers arrive as yuan or cents only through this boundary, so everything else is rejected explicitly
 * rather than coerced.
 */
export function normalizeClaimInput(input: ClaimInput): NormalizedClaimInput {
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason) {
    throw new ExpenseError('VALIDATION', 'Expense reason is required.');
  }

  const expenseDate =
    typeof input.expenseDate === 'string' ? input.expenseDate : '';
  if (!DATE_PATTERN.test(expenseDate)) {
    throw new ExpenseError('VALIDATION', 'Expense date must be a valid date.');
  }

  const departmentId = normalizeOptionalId(input.departmentId, 'Department');
  const loanId = normalizeOptionalId(input.loanId, 'Loan');

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ExpenseError(
      'VALIDATION',
      'At least one expense item is required.',
    );
  }

  const items = input.items.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new ExpenseError(
        'VALIDATION',
        `Expense item ${index + 1} is invalid.`,
      );
    }
    if (!isExpenseCategory(raw.category)) {
      throw new ExpenseError(
        'VALIDATION',
        `Expense item ${index + 1} has an unknown category.`,
      );
    }
    const amountCents = normalizeAmountCents(raw.amountCents);
    const remark =
      typeof raw.remark === 'string' && raw.remark.trim()
        ? raw.remark.trim()
        : null;
    return { category: raw.category, amountCents, remark };
  });

  const fileIds = Array.isArray(input.fileIds)
    ? input.fileIds.filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      )
    : [];

  return { reason, departmentId, expenseDate, loanId, fileIds, items };
}

export function assertTransition(
  current: string,
  action: 'approve' | 'reject' | 'review' | 'pay',
): void {
  switch (action) {
    case 'approve':
      if (current !== 'pending') {
        throw new ExpenseError(
          'INVALID_STATUS',
          'Only a pending claim can be approved.',
          409,
        );
      }
      return;
    case 'review':
      if (current !== 'approved') {
        throw new ExpenseError(
          'INVALID_STATUS',
          'Only an approved claim can be reviewed by finance.',
          409,
        );
      }
      return;
    case 'pay':
      if (current !== 'approved' && current !== 'pending_payment') {
        throw new ExpenseError(
          'INVALID_STATUS',
          'Only an approved claim can be paid.',
          409,
        );
      }
      return;
    case 'reject':
      if (current === 'paid') {
        throw new ExpenseError(
          'INVALID_STATUS',
          'A paid claim cannot be rejected.',
          409,
        );
      }
      return;
  }
}

export function assertRejectReason(reason: unknown): string {
  const value = typeof reason === 'string' ? reason.trim() : '';
  if (!value) {
    throw new ExpenseError('VALIDATION', 'A rejection reason is required.');
  }
  return value;
}

export function assertPaymentDate(value: unknown): string {
  const date = typeof value === 'string' ? value : '';
  if (!DATE_PATTERN.test(date)) {
    throw new ExpenseError('VALIDATION', 'A valid payment date is required.');
  }
  return date;
}

export function rolesFromPermissionSets(
  permissionSets: readonly string[],
  departmentManager: boolean,
): ReadonlySet<ExpenseRole> {
  const roles = new Set<ExpenseRole>();
  for (const key of permissionSets) {
    if (key === SYSTEM_ADMINISTRATOR) roles.add('admin');
    else if (key === FINANCE_PERMISSION_SET) roles.add('finance');
    else if (key === MANAGER_PERMISSION_SET) roles.add('manager');
    else if (key === EMPLOYEE_PERMISSION_SET) roles.add('employee');
  }
  if (departmentManager) roles.add('manager');
  // A registered user with no explicit role is a regular employee.
  if (roles.size === 0) roles.add('employee');
  return roles;
}

export interface ClaimCapabilities {
  readonly canEdit: boolean;
  /** Whether the editor may be opened at all; a locked claim still rejects the save. */
  readonly canOpenEditor: boolean;
  readonly canDelete: boolean;
  readonly canApprove: boolean;
  readonly canReject: boolean;
  readonly canReview: boolean;
  readonly canPay: boolean;
}

export function claimCapabilities(input: {
  readonly status: string;
  readonly viewer: ReadonlySet<ExpenseRole>;
  readonly isApplicant: boolean;
  readonly managesDepartment: boolean;
}): ClaimCapabilities {
  const admin = input.viewer.has('admin');
  const finance = input.viewer.has('finance');
  const ownsRecord = input.isApplicant || admin;
  const editable = isEditableStatus(input.status);
  const pending = input.status === 'pending';
  const awaitingFinance =
    input.status === 'approved' || input.status === 'pending_payment';
  return {
    canEdit: ownsRecord && editable,
    canOpenEditor: ownsRecord,
    canDelete: ownsRecord && input.status !== 'paid',
    canApprove: pending && (admin || input.managesDepartment),
    canReject:
      (pending && (admin || finance || input.managesDepartment)) ||
      (awaitingFinance && (admin || finance)),
    canReview: input.status === 'approved' && (admin || finance),
    canPay: awaitingFinance && (admin || finance),
  };
}

export function monthOf(date: string): string {
  return date.length >= 7 ? date.slice(0, 7) : date;
}

export function formatClaimNumber(date: string, sequence: number): string {
  const compact = date.replace(/-/g, '');
  return `BX-${compact}-${String(sequence).padStart(4, '0')}`;
}

interface AmountInput {
  readonly amountCents?: unknown;
}

function normalizeAmountCents(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ExpenseError(
      'VALIDATION',
      'Each expense amount must be a positive amount.',
    );
  }
  return amount;
}

function normalizeOptionalId(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ExpenseError('VALIDATION', `${label} is invalid.`);
  }
  return id;
}

function isRecord(
  value: unknown,
): value is AmountInput & Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
