/**
 * The wire shapes and the closed value sets of the expense feature.
 *
 * These mirror `server/routes/schemas.ts`; the server is authoritative and this file only describes what the pages
 * read. Times arrive over JSON as ISO strings, not `Date` objects.
 */

/**
 * The page id stored in the authorization permission set. It must stay in step with
 * `database/main/seeds/202610010011_expense_departments.ts`; that file cannot be imported here because it is server code.
 */
export const EXPENSE_CLAIMS_PAGE_ID = 'expenses.claims';

export const CLAIM_STATUSES = [
  'draft',
  'pending_supervisor',
  'pending_finance',
  'approved',
  'rejected',
  'paid',
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

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

export const EXPENSE_PAYMENT_METHODS = [
  'bank_transfer',
  'cash',
  'corporate_card',
  'other',
] as const;

export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

export const EXPORT_JOB_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
] as const;

export type ExportJobStatus = (typeof EXPORT_JOB_STATUSES)[number];

/** Claims over this amount need the finance review step; shown to the applicant as a hint. */
export const FINANCE_REVIEW_THRESHOLD = 5000;

/** The largest invoice the upload endpoint accepts. */
export const MAX_INVOICE_SIZE = 10 * 1024 * 1024;

/** The list and the export never page through more than this many claims at once. */
export const MAX_CLAIM_PAGE_SIZE = 100;

export interface ClaimCapabilities {
  readonly canView: boolean;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canSubmit: boolean;
  readonly canApprove: boolean;
  readonly canReject: boolean;
  readonly canPay: boolean;
}

export interface Claim {
  readonly id: string;
  readonly claimNo: string;
  readonly title: string;
  readonly applicantId: string;
  readonly applicantName: string;
  readonly departmentId: string | null;
  readonly departmentName: string | null;
  readonly status: ClaimStatus;
  readonly totalAmount: number;
  readonly remark: string | null;
  readonly submittedAt: string | null;
  readonly decidedAt: string | null;
  readonly paidAt: string | null;
  readonly paymentMethod: string | null;
  readonly paymentRemark: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface ClaimListItem extends Claim {
  readonly capabilities: ClaimCapabilities;
  readonly itemCount: number;
}

export interface ClaimItem {
  readonly id: string;
  readonly claimId: string;
  readonly category: string;
  readonly amount: number;
  readonly expenseDate: string | null;
  readonly description: string | null;
  readonly invoiceId: string | null;
  readonly invoiceName: string | null;
  readonly invoiceExt: string | null;
  readonly invoiceType: string | null;
  readonly sortOrder: number;
}

export interface ClaimApproval {
  readonly id: string;
  readonly claimId: string;
  readonly action: 'submit' | 'approve' | 'reject' | 'pay';
  readonly operatorId: string;
  readonly operatorName: string;
  readonly fromStatus: ClaimStatus;
  readonly toStatus: ClaimStatus;
  readonly comment: string | null;
  readonly createdAt: string | null;
}

export interface ClaimDetail {
  readonly claim: Claim;
  readonly items: readonly ClaimItem[];
  readonly approvals: readonly ClaimApproval[];
  readonly capabilities: ClaimCapabilities;
}

export interface Department {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly managerId: string | null;
  readonly parentId: string | null;
  readonly sortOrder: number;
  readonly active: boolean;
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
  readonly byMonth: readonly (ExpenseStatsBucket & {
    readonly month: string;
  })[];
  readonly byDepartment: readonly (ExpenseStatsBucket & {
    readonly departmentId: string | null;
    readonly departmentName: string;
  })[];
  readonly byStatus: readonly (ExpenseStatsBucket & {
    readonly status: ClaimStatus;
  })[];
}

export interface ExportJob {
  readonly id: string;
  readonly status: ExportJobStatus;
  readonly total: number;
  readonly processed: number;
  readonly progress: number;
  readonly resultFilename: string | null;
  readonly resultSize: number;
  readonly error: string | null;
  readonly filter: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly createdAt: string | null;
}

export interface ClaimListResponse {
  readonly data: ClaimListItem[];
  readonly meta: {
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  };
}

export interface DepartmentListResponse {
  readonly data: Department[];
  readonly meta: { readonly total: number };
}

export interface ExportJobListResponse {
  readonly data: ExportJob[];
  readonly meta: { readonly total: number };
}

/** The filters the list, the statistics and the export share. */
export interface ClaimFilters {
  readonly status?: string;
  readonly departmentId?: string;
  readonly keyword?: string;
  readonly submittedFrom?: string;
  readonly submittedTo?: string;
}

export interface ClaimItemInput {
  readonly category: ExpenseCategory;
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
  readonly items: readonly ClaimItemInput[];
}

/** The MIME type an invoice's extension implies, for previewers that need one (images especially). */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
};

export function mimeForExtension(extension: string | null | undefined): string {
  const key = (extension ?? '').replace(/^\./, '').toLowerCase();
  return MIME_BY_EXTENSION[key] ?? 'application/octet-stream';
}
