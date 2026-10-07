/**
 * The expense reimbursement domain as plain data.
 *
 * These types are shared by the store (which reads and writes rows), the service (which owns the workflow) and the
 * routes (which validate and shape input). Keeping them free of framework types is what lets the workflow be tested
 * without a database.
 */

/** The states a claim moves through. */
export const EXPENSE_STATUSES = [
  'draft',
  'pending_supervisor',
  'pending_finance',
  'approved',
  'rejected',
  'paid',
] as const;

export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

/** The actions that change a claim's state. Each one writes an approval record. */
export const EXPENSE_ACTIONS = ['submit', 'approve', 'reject', 'pay'] as const;

export type ExpenseAction = (typeof EXPENSE_ACTIONS)[number];

/** A claim is editable only before it enters the approval chain and after a rejection. */
export const EDITABLE_STATUSES: readonly ExpenseStatus[] = [
  'draft',
  'rejected',
];

/** Expense categories offered by the form. */
export const EXPENSE_CATEGORIES = [
  'travel',
  'transport',
  'meal',
  'office',
  'communication',
  'entertainment',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Payment methods finance can register. */
export const EXPENSE_PAYMENT_METHODS = [
  'bank_transfer',
  'cash',
  'corporate_card',
  'other',
] as const;

export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

/** Claims above this amount need a finance review on top of the supervisor's approval. */
export const FINANCE_REVIEW_THRESHOLD = 5000;

/** The department code whose members are finance staff and see every claim. */
export const FINANCE_DEPARTMENT_CODE = 'finance';

/** The largest invoice the upload endpoint accepts, in bytes. */
export const MAX_INVOICE_SIZE = 10 * 1024 * 1024;

/** The list page and the export never page through more than this many claims at once. */
export const MAX_CLAIM_PAGE_SIZE = 100;

/** The export job states. */
export const EXPORT_JOB_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
] as const;

export type ExportJobStatus = (typeof EXPORT_JOB_STATUSES)[number];

export interface DepartmentRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly managerId: string | null;
  readonly parentId: string | null;
  readonly sortOrder: number;
  readonly active: boolean;
}

export interface DepartmentMemberRecord {
  readonly id: string;
  readonly departmentId: string;
  readonly userId: string;
  readonly isPrimary: boolean;
  readonly active: boolean;
}

export interface ClaimRecord {
  readonly id: string;
  readonly claimNo: string;
  readonly title: string;
  readonly applicantId: string;
  readonly applicantName: string;
  readonly departmentId: string | null;
  readonly departmentName: string | null;
  readonly status: ExpenseStatus;
  readonly totalAmount: number;
  readonly remark: string | null;
  readonly submittedAt: Date | null;
  readonly decidedAt: Date | null;
  readonly paidAt: Date | null;
  readonly paymentMethod: string | null;
  readonly paymentRemark: string | null;
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
}

export interface ItemRecord {
  readonly id: string;
  readonly claimId: string;
  readonly category: string;
  readonly amount: number;
  readonly expenseDate: string | Date | null;
  readonly description: string | null;
  readonly invoiceId: string | null;
  readonly invoiceName: string | null;
  /** The stored file's extension, needed to build the content URL without a second query. */
  readonly invoiceExt: string | null;
  /** The stored file's MIME type, kept so the detail page can pick the right previewer. */
  readonly invoiceType: string | null;
  readonly sortOrder: number;
}

export interface ApprovalRecord {
  readonly id: string;
  readonly claimId: string;
  readonly action: ExpenseAction;
  readonly operatorId: string;
  readonly operatorName: string;
  readonly fromStatus: ExpenseStatus;
  readonly toStatus: ExpenseStatus;
  readonly comment: string | null;
  readonly createdAt: Date | null;
}

export interface ExportJobRecord {
  readonly id: string;
  readonly requesterId: string;
  readonly status: ExportJobStatus;
  readonly filter: string | null;
  readonly total: number;
  readonly processed: number;
  readonly resultFilename: string | null;
  readonly resultContent: string | null;
  readonly resultSize: number;
  readonly error: string | null;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
}

/** A claim with everything the detail page shows. */
export interface ClaimDetail {
  readonly claim: ClaimRecord;
  readonly items: readonly ItemRecord[];
  readonly approvals: readonly ApprovalRecord[];
}

/** The stage of the workflow an approval record belongs to. */
export type ActorRole = 'owner' | 'supervisor' | 'finance';

/**
 * What the acting user may do with one claim, computed by the server.
 *
 * The pages do not register these as authorization actions, so the client reads these flags off the payload instead of
 * asking `useCan`. The server computes them from the same function the transitions use, so a button can never offer
 * something the transition refuses.
 */
export interface ClaimCapabilities {
  readonly canView: boolean;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canSubmit: boolean;
  readonly canApprove: boolean;
  readonly canReject: boolean;
  readonly canPay: boolean;
}

/** Row shape the CSV export writes, one row per item. */
export interface ExportRow {
  readonly claimNo: string;
  readonly title: string;
  readonly applicantName: string;
  readonly departmentName: string | null;
  readonly status: ExpenseStatus;
  readonly totalAmount: number;
  readonly category: string;
  readonly amount: number;
  readonly expenseDate: string | null;
  readonly description: string | null;
  readonly invoiceName: string | null;
  readonly submittedAt: string | null;
  readonly paidAt: string | null;
  readonly approvalSummary: string;
}
