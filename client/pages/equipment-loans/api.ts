import type { ApiClient } from '@nocobase/app-client';

import type { Loan } from '../equipment/types.js';

export interface LoanListQuery {
  readonly keyword?: string;
  readonly status?: 'active' | 'returned';
}

/** Reads loan history, filtered by the page's search box and status filter. */
export async function fetchLoans(
  api: ApiClient,
  query: LoanListQuery,
  signal?: AbortSignal,
): Promise<Loan[]> {
  return api.request<Loan[]>({
    path: 'equipment-loans',
    query: { keyword: query.keyword, status: query.status },
    signal,
  });
}

/** Marks a loan returned; calling it again returns the same record unchanged. */
export async function returnLoan(api: ApiClient, id: number): Promise<Loan> {
  return api.request<Loan>({
    path: `equipment-loans/${id}/return`,
    method: 'POST',
  });
}
