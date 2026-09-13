import { resolveAppUrl, type ApiClient } from '@nocobase/app-client';
import { ApiClientError } from '@nocobase/app-client';

export type ExpenseStatus =
  'pending' | 'approved' | 'pending_payment' | 'paid' | 'rejected';
export type ExpenseCategory = 'travel' | 'transport' | 'meal' | 'office';

export interface ClaimCapabilities {
  readonly canEdit: boolean;
  readonly canOpenEditor: boolean;
  readonly canDelete: boolean;
  readonly canApprove: boolean;
  readonly canReject: boolean;
  readonly canReview: boolean;
  readonly canPay: boolean;
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
  readonly status: ExpenseStatus;
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

export interface ViewerInfo {
  readonly userId: string;
  readonly name: string;
  readonly roles: readonly string[];
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

export interface ClaimItemInput {
  readonly category: ExpenseCategory;
  readonly amountCents: number;
  readonly remark: string | null;
}

export interface ClaimInput {
  readonly reason: string;
  readonly departmentId: number | null;
  readonly expenseDate: string;
  readonly loanId: number | null;
  readonly fileIds: readonly string[];
  readonly items: readonly ClaimItemInput[];
}

export interface ExpenseApi {
  me(): Promise<ViewerInfo>;
  departments(): Promise<readonly DepartmentRecord[]>;
  users(): Promise<readonly { id: string; name: string; username: string }[]>;
  claims(): Promise<readonly ClaimRecord[]>;
  claim(id: number): Promise<ClaimRecord>;
  createClaim(input: ClaimInput): Promise<ClaimRecord>;
  updateClaim(id: number, input: ClaimInput): Promise<ClaimRecord>;
  deleteClaim(id: number): Promise<void>;
  approve(id: number): Promise<ClaimRecord>;
  reject(id: number, reason: string): Promise<ClaimRecord>;
  review(id: number): Promise<ClaimRecord>;
  pay(id: number, paymentDate: string): Promise<ClaimRecord>;
  approvals(): Promise<readonly ClaimRecord[]>;
  payments(): Promise<readonly ClaimRecord[]>;
  loans(options?: { unsettledOnly?: boolean }): Promise<readonly LoanRecord[]>;
  createLoan(input: {
    amountCents: number;
    loanDate: string;
    purpose: string;
  }): Promise<LoanRecord>;
  stats(): Promise<ExpenseStatistics>;
}

export function createExpenseApi(api: ApiClient): ExpenseApi {
  return {
    me: () => get<ViewerInfo>(api, 'expense/me'),
    departments: () =>
      get<readonly DepartmentRecord[]>(api, 'expense/departments'),
    users: () =>
      get<readonly { id: string; name: string; username: string }[]>(
        api,
        'expense/users',
      ),
    claims: () => get<readonly ClaimRecord[]>(api, 'expense/claims'),
    claim: (id) => get<ClaimRecord>(api, `expense/claims/${id}`),
    createClaim: (input) => post<ClaimRecord>(api, 'expense/claims', input),
    updateClaim: (id, input) =>
      put<ClaimRecord>(api, `expense/claims/${id}`, input),
    deleteClaim: async (id) => {
      await request(api, `expense/claims/${id}`, 'DELETE');
    },
    approve: (id) => post<ClaimRecord>(api, `expense/claims/${id}/approve`, {}),
    reject: (id, reason) =>
      post<ClaimRecord>(api, `expense/claims/${id}/reject`, { reason }),
    review: (id) => post<ClaimRecord>(api, `expense/claims/${id}/review`, {}),
    pay: (id, paymentDate) =>
      post<ClaimRecord>(api, `expense/claims/${id}/pay`, { paymentDate }),
    approvals: () => get<readonly ClaimRecord[]>(api, 'expense/approvals'),
    payments: () => get<readonly ClaimRecord[]>(api, 'expense/payments'),
    loans: (options) =>
      get<readonly LoanRecord[]>(
        api,
        'expense/loans',
        options?.unsettledOnly ? { unsettled: 'true' } : undefined,
      ),
    createLoan: (input) => post<LoanRecord>(api, 'expense/loans', input),
    stats: () => get<ExpenseStatistics>(api, 'expense/stats'),
  };
}

export class ExpenseApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ExpenseApiError';
  }
}

async function get<T>(
  api: ApiClient,
  path: string,
  query?: Record<string, string>,
): Promise<T> {
  return request<T>(api, path, 'GET', undefined, query);
}

async function post<T>(
  api: ApiClient,
  path: string,
  body: unknown,
): Promise<T> {
  return request<T>(api, path, 'POST', body);
}

async function put<T>(api: ApiClient, path: string, body: unknown): Promise<T> {
  return request<T>(api, path, 'PUT', body);
}

async function request<T>(
  api: ApiClient,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
  query?: Record<string, string>,
): Promise<T> {
  try {
    const options = {
      path,
      method,
      ...(query === undefined ? {} : { query }),
      ...(body === undefined ? {} : { json: body }),
    };
    const response = await api.request<{ data: T }>(options);
    return response.data;
  } catch (error) {
    throw new ExpenseApiError(
      errorMessage(error),
      error instanceof ApiClientError ? error.status : undefined,
    );
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const payload = error.payload;
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = (payload as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Request failed.';
}

export function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function yuanToCents(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export function attachmentHref(file: AttachmentRecord): string {
  return resolveAppUrl(file.url);
}
