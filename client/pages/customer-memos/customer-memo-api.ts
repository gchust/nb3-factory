import type { ApiClient } from '@nocobase/app-client';

import type { CustomerMemo } from './types.js';

/**
 * Reads the memo list. `search` is matched against the customer name on the
 * server with a partial, case-insensitive comparison; an empty search returns
 * every memo.
 */
export async function fetchCustomerMemos(
  api: ApiClient,
  search: string,
  signal?: AbortSignal,
): Promise<CustomerMemo[]> {
  const { data } = await api.request<{ data: CustomerMemo[] }>({
    path: 'customer-memos',
    query: { search: search.trim() || undefined },
    signal,
  });
  return data;
}

/** Permanently removes one memo. */
export async function deleteCustomerMemo(
  api: ApiClient,
  id: number,
): Promise<void> {
  await api.request<void>({
    path: `customer-memos/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}
