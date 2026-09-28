import type { ApiClient } from '@nocobase/app-client';

import type { CustomerMemo, CustomerMemoInput } from './types.js';

const PATH = 'customer-memos';

export async function fetchMemos(
  api: ApiClient,
  search: string,
  signal?: AbortSignal,
): Promise<CustomerMemo[]> {
  const { data } = await api.request<{ data: CustomerMemo[] }>({
    path: PATH,
    query: { search: search || undefined },
    signal,
  });
  return data;
}

export async function fetchMemo(
  api: ApiClient,
  id: number | string,
  signal?: AbortSignal,
): Promise<CustomerMemo> {
  const { data } = await api.request<{ data: CustomerMemo }>({
    path: `${PATH}/${encodeURIComponent(id)}`,
    signal,
  });
  return data;
}

export async function createMemo(
  api: ApiClient,
  input: CustomerMemoInput,
): Promise<CustomerMemo> {
  const { data } = await api.request<{ data: CustomerMemo }, CustomerMemoInput>(
    {
      path: PATH,
      method: 'POST',
      json: input,
    },
  );
  return data;
}

export async function updateMemo(
  api: ApiClient,
  id: number,
  input: CustomerMemoInput,
): Promise<CustomerMemo> {
  const { data } = await api.request<{ data: CustomerMemo }, CustomerMemoInput>(
    {
      path: `${PATH}/${id}`,
      method: 'PATCH',
      json: input,
    },
  );
  return data;
}

export async function deleteMemo(api: ApiClient, id: number): Promise<void> {
  await api.request<void>({ path: `${PATH}/${id}`, method: 'DELETE' });
}
