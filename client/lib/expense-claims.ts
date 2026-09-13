import type { ApiClient } from '@nocobase/app-client';

/** A receipt file attached to an expense claim. */
export interface ExpenseClaimAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  /** Host-aware download path, decorated by the server. */
  readonly contentUrl: string;
}

/** A claim in the list, with just the number of receipts attached. */
export interface ExpenseClaimSummary {
  readonly id: number;
  readonly reason: string;
  readonly amount: number;
  readonly expenseDate: string;
  readonly createdAt: string;
  readonly attachmentCount: number;
}

export interface ExpenseClaim extends Omit<
  ExpenseClaimSummary,
  'attachmentCount'
> {
  readonly attachments: readonly ExpenseClaimAttachment[];
}

export interface CreateExpenseClaimInput {
  readonly reason: string;
  readonly amount: number;
  readonly expenseDate: string;
  readonly attachmentIds: readonly string[];
}

export async function fetchExpenseClaims(
  api: ApiClient,
): Promise<readonly ExpenseClaimSummary[]> {
  const response = await api.request<{ data: ExpenseClaimSummary[] }>({
    path: 'expense-claims',
  });
  return response.data ?? [];
}

export async function fetchExpenseClaim(
  api: ApiClient,
  id: number,
): Promise<ExpenseClaim> {
  const response = await api.request<{ data: ExpenseClaim }>({
    path: `expense-claims/${id}`,
  });
  return response.data;
}

export async function createExpenseClaim(
  api: ApiClient,
  input: CreateExpenseClaimInput,
): Promise<ExpenseClaim> {
  const response = await api.request<
    { data: ExpenseClaim },
    CreateExpenseClaimInput
  >({
    path: 'expense-claims',
    method: 'POST',
    json: input,
  });
  return response.data;
}

/** Formats an amount with two decimals and thousands separators. */
export function formatAmount(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Formats a byte count for the attachment list. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reads a category label for an attachment extension. */
export function fileKindLabel(attachment: {
  readonly ext: string;
  readonly mimeType: string;
}): string {
  if (attachment.mimeType === 'application/pdf' || attachment.ext === 'pdf') {
    return 'PDF';
  }
  if (attachment.mimeType.startsWith('image/'))
    return attachment.ext.toUpperCase();
  return attachment.ext ? attachment.ext.toUpperCase() : 'FILE';
}
