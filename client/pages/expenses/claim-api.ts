import { resolveAppUrl, type ApiClient } from '@nocobase/app-client';

import type {
  ClaimDetail,
  ClaimFilters,
  ClaimInput,
  ClaimListResponse,
  ExpensePaymentMethod,
  DepartmentListResponse,
  ExpenseStats,
  ExportJob,
  ExportJobListResponse,
} from './types.js';

/**
 * The expense endpoints, as plain functions.
 *
 * A plain function cannot call hooks, so every one takes the client the component resolved with `useApiClient()`.
 * Ids are always encoded: they are opaque strings that may come from a URL segment.
 */

const API_BASE = '/api';

function claimPath(claimId: string): string {
  return `expenseClaims/${encodeURIComponent(claimId)}`;
}

export async function fetchClaims(
  api: ApiClient,
  query: ClaimFilters & {
    page?: number;
    pageSize?: number;
    sort?: string;
    order?: string;
  },
  signal?: AbortSignal,
): Promise<ClaimListResponse> {
  return api.request<ClaimListResponse>({
    path: 'expenseClaims',
    query: {
      status: query.status,
      departmentId: query.departmentId,
      keyword: query.keyword,
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      order: query.order,
    },
    signal,
  });
}

export async function fetchClaim(
  api: ApiClient,
  claimId: string,
  signal?: AbortSignal,
): Promise<ClaimDetail> {
  const { data } = await api.request<{ data: ClaimDetail }>({
    path: claimPath(claimId),
    signal,
  });
  return data;
}

export async function createClaim(
  api: ApiClient,
  input: ClaimInput,
): Promise<ClaimDetail> {
  const { data } = await api.request<{ data: ClaimDetail }, ClaimInput>({
    path: 'expenseClaims',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateClaim(
  api: ApiClient,
  claimId: string,
  input: ClaimInput,
): Promise<ClaimDetail> {
  const { data } = await api.request<{ data: ClaimDetail }, ClaimInput>({
    path: claimPath(claimId),
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function deleteClaim(
  api: ApiClient,
  claimId: string,
): Promise<void> {
  await api.request<void>({ path: claimPath(claimId), method: 'DELETE' });
}

export async function submitClaim(
  api: ApiClient,
  claimId: string,
  comment?: string,
): Promise<ClaimDetail> {
  return decision(api, claimId, 'submit', comment);
}

export async function approveClaim(
  api: ApiClient,
  claimId: string,
  comment?: string,
): Promise<ClaimDetail> {
  return decision(api, claimId, 'approve', comment);
}

export async function rejectClaim(
  api: ApiClient,
  claimId: string,
  comment: string,
): Promise<ClaimDetail> {
  return decision(api, claimId, 'reject', comment);
}

async function decision(
  api: ApiClient,
  claimId: string,
  action: 'submit' | 'approve' | 'reject',
  comment?: string,
): Promise<ClaimDetail> {
  const { data } = await api.request<
    { data: ClaimDetail },
    { comment?: string }
  >({
    path: `${claimPath(claimId)}/${action}`,
    method: 'POST',
    json: { comment },
  });
  return data;
}

export async function payClaim(
  api: ApiClient,
  claimId: string,
  paymentMethod: ExpensePaymentMethod,
  paymentRemark?: string,
): Promise<ClaimDetail> {
  const { data } = await api.request<
    { data: ClaimDetail },
    { paymentMethod: string; paymentRemark?: string }
  >({
    path: `${claimPath(claimId)}/pay`,
    method: 'POST',
    json: { paymentMethod, paymentRemark },
  });
  return data;
}

export async function fetchDepartments(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<DepartmentListResponse> {
  return api.request<DepartmentListResponse>({
    path: 'expenseDepartments',
    signal,
  });
}

export async function fetchStats(
  api: ApiClient,
  query: ClaimFilters,
  signal?: AbortSignal,
): Promise<ExpenseStats> {
  const { data } = await api.request<{ data: ExpenseStats }>({
    path: 'expenseStats',
    query: {
      status: query.status,
      departmentId: query.departmentId,
      keyword: query.keyword,
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
    },
    signal,
  });
  return data;
}

export async function startExport(
  api: ApiClient,
  filters: ClaimFilters,
): Promise<ExportJob> {
  const { data } = await api.request<{ data: ExportJob }, ClaimFilters>({
    path: 'expenseExports',
    method: 'POST',
    json: filters,
  });
  return data;
}

export async function listExports(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<ExportJobListResponse> {
  return api.request<ExportJobListResponse>({ path: 'expenseExports', signal });
}

export async function fetchExport(
  api: ApiClient,
  exportId: string,
  signal?: AbortSignal,
): Promise<ExportJob> {
  const { data } = await api.request<{ data: ExportJob }>({
    path: `expenseExports/${encodeURIComponent(exportId)}`,
    signal,
  });
  return data;
}

/**
 * The URL of a completed export's CSV.
 *
 * Built with `resolveAppUrl`, which adds the deployment base path; the download is a navigation, not an
 * `api.request()`, so nothing here reads the client's JSON envelope.
 */
export function exportDownloadUrl(exportId: string): string {
  return resolveAppUrl(
    `${API_BASE}/expenseExports/${encodeURIComponent(exportId)}/download`,
  );
}

/**
 * The URL of one invoice's bytes.
 *
 * The file plugin's content route is keyed by the stored file's id and extension, both of which live on the expense
 * line, so no second query is needed. `resolveAppUrl` adds the base path. A line with no invoice has no URL, which
 * the caller decides by checking the id before calling this.
 */
export function invoiceContentUrl(file: {
  readonly invoiceId: string;
  readonly invoiceExt: string | null;
}): string {
  const suffix = file.invoiceExt
    ? `.${encodeURIComponent(file.invoiceExt)}`
    : '';
  return resolveAppUrl(
    `/uploads/expenseInvoices/${encodeURIComponent(file.invoiceId)}${suffix}`,
  );
}
