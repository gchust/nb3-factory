/**
 * HTTP calls for the equipment feature.
 *
 * These are plain functions: a component gets the client with `useApiClient()`
 * and passes it in. The path is relative to the API base URL, so it never
 * includes `/api` or the deployment base path.
 */
import type { ApiClient } from '@nocobase/app-client';

import type {
  BorrowFormValues,
  EquipmentFormValues,
  EquipmentItem,
  EquipmentRecord,
  EquipmentStats,
  EquipmentStatus,
  LoanItem,
  LoanRecord,
} from './types.js';

export type EquipmentStatusFilter = 'all' | EquipmentStatus;

export interface EquipmentListResult {
  readonly items: EquipmentItem[];
  readonly stats: EquipmentStats;
}

export interface EquipmentListParams {
  readonly search?: string;
  readonly status?: EquipmentStatusFilter;
  readonly signal?: AbortSignal;
}

export interface LoanListParams {
  readonly search?: string;
  readonly status?: 'all' | 'unreturned' | 'returned';
  readonly signal?: AbortSignal;
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

export async function fetchEquipment(
  api: ApiClient,
  params: EquipmentListParams = {},
): Promise<EquipmentListResult> {
  const { data, stats } = await api.request<{
    data: EquipmentItem[];
    stats: EquipmentStats;
  }>({
    path: 'equipment',
    query: {
      search: trimOrUndefined(params.search),
      status: params.status === 'all' ? undefined : params.status,
    },
    signal: params.signal,
  });
  return { items: data, stats };
}

export async function createEquipment(
  api: ApiClient,
  values: EquipmentFormValues,
): Promise<EquipmentRecord> {
  const { data } = await api.request<
    { data: EquipmentRecord },
    EquipmentFormValues
  >({
    path: 'equipment',
    method: 'POST',
    json: values,
  });
  return data;
}

export async function updateEquipment(
  api: ApiClient,
  id: number,
  values: EquipmentFormValues,
): Promise<EquipmentRecord> {
  const { data } = await api.request<
    { data: EquipmentRecord },
    EquipmentFormValues
  >({
    path: `equipment/${id}`,
    method: 'PATCH',
    json: values,
  });
  return data;
}

export async function borrowEquipment(
  api: ApiClient,
  equipmentId: number,
  values: Omit<BorrowFormValues, 'equipmentId'>,
): Promise<LoanRecord> {
  const { data } = await api.request<{ data: LoanRecord }>({
    path: `equipment/${equipmentId}/loans`,
    method: 'POST',
    json: values,
  });
  return data;
}

export async function returnLoan(
  api: ApiClient,
  loanId: number,
): Promise<LoanRecord> {
  const { data } = await api.request<{ data: LoanRecord }>({
    path: `loans/${loanId}/return`,
    method: 'POST',
  });
  return data;
}

export async function fetchLoans(
  api: ApiClient,
  params: LoanListParams = {},
): Promise<LoanItem[]> {
  const { data } = await api.request<{ data: LoanItem[] }>({
    path: 'loans',
    query: {
      search: trimOrUndefined(params.search),
      status: params.status === 'all' ? undefined : params.status,
    },
    signal: params.signal,
  });
  return data;
}
