import { apiClientToken, useService } from '@nocobase/app-client';
import { useMemo } from 'react';

export type ClaimStatus =
  'draft' | 'pending' | 'approved' | 'rejected' | 'paid';

export type ClaimType = 'travel' | 'hospitality' | 'office';

export type ReceiptType =
  'vat-invoice' | 'electronic-invoice' | 'receipt' | 'other';

export const CLAIM_STATUSES: readonly ClaimStatus[] = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'paid',
];

export const CLAIM_TYPES: readonly ClaimType[] = [
  'travel',
  'hospitality',
  'office',
];

export const RECEIPT_TYPES: readonly ReceiptType[] = [
  'vat-invoice',
  'electronic-invoice',
  'receipt',
  'other',
];

export interface ExpenseClaim {
  id: number;
  number: string;
  applicantId: string;
  applicantName: string;
  departmentId: number;
  departmentName: string;
  type: ClaimType;
  reason: string;
  appliedAt: string;
  status: ClaimStatus;
  totalAmount: number;
  receiptCount: number;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseReceipt {
  id: number;
  claimId: number;
  applicantId: string;
  departmentId: number;
  fileId: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  amount: number;
  invoiceDate: string;
  receiptType: ReceiptType;
  claimNumber?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseClaimDetail extends ExpenseClaim {
  receipts: ExpenseReceipt[];
}

export interface ExpenseDepartment {
  id: number;
  name: string;
  managerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseStatisticsRow {
  key: string;
  type: ClaimType | null;
  departmentName: string | null;
  claimCount: number;
  receiptCount: number;
  totalAmount: number;
}

export interface CreateClaimInput {
  departmentId: number;
  type: ClaimType;
  reason: string;
  appliedAt: string;
}

export interface CreateReceiptInput {
  fileId: string;
  amount: number;
  invoiceDate: string;
  receiptType: ReceiptType;
}

export interface ExpenseApi {
  listDepartments(): Promise<ExpenseDepartment[]>;
  createDepartment(input: {
    name: string;
    managerId: string | null;
  }): Promise<void>;
  updateDepartment(
    id: number,
    input: { name?: string; managerId?: string | null },
  ): Promise<void>;
  deleteDepartment(id: number): Promise<void>;
  listClaims(): Promise<ExpenseClaim[]>;
  getClaim(id: number): Promise<ExpenseClaimDetail>;
  createClaim(input: CreateClaimInput): Promise<{ id: number; number: string }>;
  deleteClaim(id: number): Promise<void>;
  submitClaim(id: number): Promise<void>;
  approveClaim(id: number): Promise<void>;
  rejectClaim(id: number, reason: string): Promise<void>;
  payClaim(id: number): Promise<void>;
  addReceipt(claimId: number, input: CreateReceiptInput): Promise<void>;
  deleteReceipt(claimId: number, receiptId: number): Promise<void>;
  listReceipts(): Promise<ExpenseReceipt[]>;
  statistics(): Promise<ExpenseStatisticsRow[]>;
}

interface Envelope<T> {
  data: T;
}

/**
 * The browser's view of the expense endpoints. Every call goes through the application's API client so the
 * request follows the configured base URL, and the server independently authenticates and authorizes each one.
 */
export function useExpenseApi(): ExpenseApi {
  const api = useService(apiClientToken);
  return useMemo<ExpenseApi>(
    () => ({
      listDepartments: () =>
        api
          .request<Envelope<ExpenseDepartment[]>>({
            path: 'expense/departments',
          })
          .then((response) => response.data),
      createDepartment: (input) =>
        api
          .request<Envelope<{ id: number }>>({
            path: 'expense/departments',
            method: 'POST',
            json: input,
          })
          .then(() => undefined),
      updateDepartment: (id, input) =>
        api
          .request<Envelope<{ updated: number }>>({
            path: `expense/departments/${id}`,
            method: 'PATCH',
            json: input,
          })
          .then(() => undefined),
      deleteDepartment: (id) =>
        api
          .request<Envelope<{ deleted: number }>>({
            path: `expense/departments/${id}`,
            method: 'DELETE',
          })
          .then(() => undefined),
      listClaims: () =>
        api
          .request<Envelope<ExpenseClaim[]>>({ path: 'expense/claims' })
          .then((response) => response.data),
      getClaim: (id) =>
        api
          .request<Envelope<ExpenseClaimDetail>>({
            path: `expense/claims/${id}`,
          })
          .then((response) => response.data),
      createClaim: (input) =>
        api
          .request<Envelope<{ id: number; number: string }>>({
            path: 'expense/claims',
            method: 'POST',
            json: input,
          })
          .then((response) => response.data),
      deleteClaim: (id) =>
        api
          .request<Envelope<{ deleted: boolean }>>({
            path: `expense/claims/${id}`,
            method: 'DELETE',
          })
          .then(() => undefined),
      submitClaim: (id) =>
        api
          .request<Envelope<{ status: string }>>({
            path: `expense/claims/${id}/submit`,
            method: 'POST',
          })
          .then(() => undefined),
      approveClaim: (id) =>
        api
          .request<Envelope<{ status: string }>>({
            path: `expense/claims/${id}/approve`,
            method: 'POST',
          })
          .then(() => undefined),
      rejectClaim: (id, reason) =>
        api
          .request<Envelope<{ status: string }>>({
            path: `expense/claims/${id}/reject`,
            method: 'POST',
            json: { reason },
          })
          .then(() => undefined),
      payClaim: (id) =>
        api
          .request<Envelope<{ status: string }>>({
            path: `expense/claims/${id}/pay`,
            method: 'POST',
          })
          .then(() => undefined),
      addReceipt: (claimId, input) =>
        api
          .request<Envelope<{ id: number }>>({
            path: `expense/claims/${claimId}/receipts`,
            method: 'POST',
            json: input,
          })
          .then(() => undefined),
      deleteReceipt: (claimId, receiptId) =>
        api
          .request<Envelope<{ deleted: boolean }>>({
            path: `expense/claims/${claimId}/receipts/${receiptId}`,
            method: 'DELETE',
          })
          .then(() => undefined),
      listReceipts: () =>
        api
          .request<Envelope<ExpenseReceipt[]>>({ path: 'expense/receipts' })
          .then((response) => response.data),
      statistics: () =>
        api
          .request<Envelope<ExpenseStatisticsRow[]>>({
            path: 'expense/statistics',
          })
          .then((response) => response.data),
    }),
    [api],
  );
}
