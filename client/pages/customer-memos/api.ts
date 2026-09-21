import type { ApiClient } from '@nocobase/app-client';

/** A customer memo as the API returns it. */
export interface CustomerMemo {
  readonly id: number;
  readonly customerName: string;
  readonly note: string | null;
  readonly createdAt: string;
}

/** The fields a memo form submits. */
export interface CustomerMemoInput {
  readonly customerName: string;
  readonly note: string | null;
}

export async function listCustomerMemos(
  api: ApiClient,
  search: string,
  signal?: AbortSignal,
): Promise<CustomerMemo[]> {
  const term = search.trim();
  const response = await api.request<{ data: CustomerMemo[] }>({
    path: 'customer-memos',
    ...(term ? { query: { search: term } } : {}),
    ...(signal ? { signal } : {}),
  });
  return response.data;
}

export async function createCustomerMemo(
  api: ApiClient,
  input: CustomerMemoInput,
): Promise<CustomerMemo> {
  const response = await api.request<{ data: CustomerMemo }>({
    path: 'customer-memos',
    method: 'POST',
    json: input,
  });
  return response.data;
}

export async function updateCustomerMemo(
  api: ApiClient,
  id: number,
  input: CustomerMemoInput,
): Promise<CustomerMemo> {
  const response = await api.request<{ data: CustomerMemo }>({
    path: `customer-memos/${id}`,
    method: 'PATCH',
    json: input,
  });
  return response.data;
}

export async function deleteCustomerMemo(
  api: ApiClient,
  id: number,
): Promise<void> {
  await api.request<void>({
    path: `customer-memos/${id}`,
    method: 'DELETE',
  });
}
