import type { ApiClient } from '@nocobase/app-client';

/** A customer memo as the server returns it. */
export interface CustomerMemo {
  readonly id: number;
  readonly name: string;
  readonly notes: string | null;
  readonly createdAt: string;
}

/** Writable fields of a customer memo. */
export interface CustomerMemoInput {
  readonly name: string;
  readonly notes?: string | null;
}

const basePath = 'customer-memos';

export async function listCustomerMemos(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<CustomerMemo[]> {
  const { data } = await api.request<{ data: CustomerMemo[] }>({
    path: basePath,
    signal,
  });
  return data;
}

export async function createCustomerMemo(
  api: ApiClient,
  input: CustomerMemoInput,
): Promise<CustomerMemo> {
  const { data } = await api.request<{ data: CustomerMemo }>({
    path: basePath,
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateCustomerMemo(
  api: ApiClient,
  id: number,
  input: CustomerMemoInput,
): Promise<CustomerMemo> {
  const { data } = await api.request<{ data: CustomerMemo }>({
    path: `${basePath}/${encodeURIComponent(id)}`,
    method: 'PUT',
    json: input,
  });
  return data;
}

export async function deleteCustomerMemo(
  api: ApiClient,
  id: number,
): Promise<void> {
  await api.request<void>({
    path: `${basePath}/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}
