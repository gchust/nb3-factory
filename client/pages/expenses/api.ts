import type { ApiClient } from '@nocobase/app-client';

export type ExpenseStatus =
  'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';

export type ExpenseRole = 'employee' | 'manager' | 'finance' | 'admin';

export type ExpenseScope = 'mine' | 'approvals' | 'finance' | 'all';

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
}

export interface ExpenseActionView {
  readonly id: string;
  readonly action: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly comment: string | null;
  readonly createdAt: string;
}

export interface ExpenseCapabilities {
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canSubmit: boolean;
  readonly canApprove: boolean;
  readonly canReject: boolean;
  readonly canPay: boolean;
}

export interface ExpenseReportDetail {
  readonly report: ExpenseReportSummary;
  readonly items: readonly ExpenseItemView[];
  readonly actions: readonly ExpenseActionView[];
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

export interface ExpenseStatistics {
  readonly totalAmount: number;
  readonly reportCount: number;
  readonly itemCount: number;
  readonly byCategory: readonly {
    readonly categoryId: string;
    readonly categoryName: string;
    readonly amount: number;
    readonly count: number;
  }[];
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

export interface ExpenseItemInput {
  readonly categoryId: string;
  readonly expenseDate: string;
  readonly amount: number;
  readonly description: string;
}

export interface ExpenseReportInput {
  readonly purpose: string;
  readonly items: readonly ExpenseItemInput[];
}

export interface ExpenseListQuery {
  readonly scope?: ExpenseScope;
  readonly status?: string;
  readonly categoryId?: string;
  readonly search?: string;
  readonly from?: string;
  readonly to?: string;
}

export const EXPENSE_STATUSES: readonly ExpenseStatus[] = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'paid',
];

export async function fetchExpenseMeta(api: ApiClient): Promise<ExpenseMeta> {
  const response = await api.request<{ data: ExpenseMeta }>({
    path: 'expenses/meta',
  });
  return response.data;
}

export async function fetchExpenseReports(
  api: ApiClient,
  query: ExpenseListQuery,
): Promise<{ data: readonly ExpenseReportSummary[]; allowed: boolean }> {
  const response = await api.request<{
    data: readonly ExpenseReportSummary[];
    meta: { total: number; allowed: boolean };
  }>({ path: 'expenses/reports', query: toQuery(query) });
  return { data: response.data, allowed: response.meta.allowed };
}

export async function fetchExpenseReport(
  api: ApiClient,
  id: string,
): Promise<ExpenseReportDetail> {
  const response = await api.request<{ data: ExpenseReportDetail }>({
    path: `expenses/reports/${encodeURIComponent(id)}`,
  });
  return response.data;
}

export async function createExpenseReport(
  api: ApiClient,
  input: ExpenseReportInput,
): Promise<ExpenseReportDetail> {
  const response = await api.request<{ data: ExpenseReportDetail }>({
    path: 'expenses/reports',
    method: 'POST',
    json: input,
  });
  return response.data;
}

export async function updateExpenseReport(
  api: ApiClient,
  id: string,
  input: ExpenseReportInput,
): Promise<ExpenseReportDetail> {
  const response = await api.request<{ data: ExpenseReportDetail }>({
    path: `expenses/reports/${encodeURIComponent(id)}`,
    method: 'PUT',
    json: input,
  });
  return response.data;
}

export async function deleteExpenseReport(
  api: ApiClient,
  id: string,
): Promise<void> {
  await api.request<void>({
    path: `expenses/reports/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}

export async function submitExpenseReport(
  api: ApiClient,
  id: string,
): Promise<ExpenseReportDetail> {
  const response = await api.request<{ data: ExpenseReportDetail }>({
    path: `expenses/reports/${encodeURIComponent(id)}/submit`,
    method: 'POST',
  });
  return response.data;
}

export async function approveExpenseReport(
  api: ApiClient,
  id: string,
  comment?: string,
): Promise<ExpenseReportDetail> {
  const response = await api.request<{ data: ExpenseReportDetail }>({
    path: `expenses/reports/${encodeURIComponent(id)}/approve`,
    method: 'POST',
    json: { comment: comment ?? '' },
  });
  return response.data;
}

export async function rejectExpenseReport(
  api: ApiClient,
  id: string,
  comment: string,
): Promise<ExpenseReportDetail> {
  const response = await api.request<{ data: ExpenseReportDetail }>({
    path: `expenses/reports/${encodeURIComponent(id)}/reject`,
    method: 'POST',
    json: { comment },
  });
  return response.data;
}

export async function payExpenseReport(
  api: ApiClient,
  id: string,
): Promise<ExpenseReportDetail> {
  const response = await api.request<{ data: ExpenseReportDetail }>({
    path: `expenses/reports/${encodeURIComponent(id)}/pay`,
    method: 'POST',
  });
  return response.data;
}

export async function fetchExpenseStatistics(
  api: ApiClient,
  query: ExpenseListQuery,
): Promise<ExpenseStatistics> {
  const response = await api.request<{ data: ExpenseStatistics }>({
    path: 'expenses/statistics',
    query: toQuery(query),
  });
  return response.data;
}

function toQuery(query: ExpenseListQuery): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value !== '' && value !== 'all') {
      result[key] = value;
    }
  }
  return result;
}
