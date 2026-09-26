import type { ApiClient } from '@nocobase/app-client';

import type {
  BorrowFormValues,
  Equipment,
  EquipmentFormValues,
  EquipmentListQuery,
  EquipmentListResponse,
} from './types.js';

/** Reads the ledger, filtered by the page's search box and status filter. */
export async function fetchEquipmentList(
  api: ApiClient,
  query: EquipmentListQuery,
  signal?: AbortSignal,
): Promise<EquipmentListResponse> {
  return api.request<EquipmentListResponse>({
    path: 'equipment',
    query: { keyword: query.keyword, status: query.status },
    signal,
  });
}

/** Reads one device; rejects with a 404 `ApiClientError` when it does not exist. */
export async function fetchEquipment(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<Equipment> {
  return api.request<Equipment>({
    path: `equipment/${id}`,
    signal,
  });
}

export async function createEquipment(
  api: ApiClient,
  values: EquipmentFormValues,
): Promise<Equipment> {
  return api.request<Equipment>({
    path: 'equipment',
    method: 'POST',
    json: values,
  });
}

export async function updateEquipment(
  api: ApiClient,
  id: number,
  values: EquipmentFormValues,
): Promise<Equipment> {
  return api.request<Equipment>({
    path: `equipment/${id}`,
    method: 'PATCH',
    json: values,
  });
}

/** Borrows a device; rejects with a 409 `ApiClientError` when another loan is still open. */
export async function borrowEquipment(
  api: ApiClient,
  id: number,
  values: BorrowFormValues,
): Promise<void> {
  await api.request<
    void,
    { borrower: string; purpose: string; expectedReturnAt: string }
  >({
    path: `equipment/${id}/borrow`,
    method: 'POST',
    json: {
      borrower: values.borrower,
      purpose: values.purpose,
      expectedReturnAt: values.expectedReturnAt.toISOString(),
    },
  });
}
