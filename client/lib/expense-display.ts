import { resolveAppUrl } from '@nocobase/app-client';

import type { ClaimStatus, ClaimType, ReceiptType } from './expense-api.js';

/** The content route registered for receipt files. Kept in step with the server's file routes. */
export const RECEIPT_CONTENT_PATH = '/uploads/expense-receipts';

export function receiptContentUrl(file: {
  readonly fileId: string;
  readonly ext: string;
}): string {
  const extension = file.ext ? `.${file.ext}` : '';
  return resolveAppUrl(`${RECEIPT_CONTENT_PATH}/${file.fileId}${extension}`);
}

/** Translation keys, not literals: every label a user reads resolves in the application's locale namespace. */
export const CLAIM_STATUS_KEYS: Readonly<Record<ClaimStatus, string>> = {
  draft: 'expense.status.draft',
  pending: 'expense.status.pending',
  approved: 'expense.status.approved',
  rejected: 'expense.status.rejected',
  paid: 'expense.status.paid',
};

export const CLAIM_TYPE_KEYS: Readonly<Record<ClaimType, string>> = {
  travel: 'expense.type.travel',
  hospitality: 'expense.type.hospitality',
  office: 'expense.type.office',
};

export const RECEIPT_TYPE_KEYS: Readonly<Record<ReceiptType, string>> = {
  'vat-invoice': 'expense.receiptType.vatInvoice',
  'electronic-invoice': 'expense.receiptType.electronicInvoice',
  receipt: 'expense.receiptType.receipt',
  other: 'expense.receiptType.other',
};

export function formatAmount(value: unknown): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

/** Date-only fields are stored at UTC midnight, so they read back on the intended day in any time zone. */
export function formatDate(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatFileSize(value: unknown): string {
  const size = Number(value ?? 0);
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** A readable message for a thrown value, used for every error surfaced in the UI. */
export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
