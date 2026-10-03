import { ApiClientError, type ApiClient } from '@nocobase/app-client';

import type {
  Contact,
  Customer,
  CustomerDetail,
  Opportunity,
} from './types.js';

export interface CustomerChanges {
  readonly name?: string;
  readonly industry?: string | null;
}

export interface ContactChanges {
  readonly name?: string;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly customerId?: number;
}

export interface OpportunityChanges {
  readonly name?: string;
  readonly customerId?: number;
  readonly amount?: number;
  readonly stage?: string;
}

/**
 * The input a rejected request points at, so the form can put the message on
 * the right field. The server answers a validation failure with
 * `{ error: { code, message, field } }`.
 */
export function errorFieldOf(error: unknown): string | undefined {
  if (!(error instanceof ApiClientError)) return undefined;
  const payload = error.payload;
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return undefined;
  }
  const body = (payload as { error?: unknown }).error;
  if (!body || typeof body !== 'object' || !('field' in body)) return undefined;
  const field = (body as { field?: unknown }).field;
  return typeof field === 'string' ? field : undefined;
}

export async function fetchCustomers(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<Customer[]> {
  const { data } = await api.request<{ data: Customer[] }>({
    path: 'customers',
    signal,
  });
  return data;
}

export async function fetchCustomerDetail(
  api: ApiClient,
  id: number | string,
  signal?: AbortSignal,
): Promise<CustomerDetail> {
  const { data } = await api.request<{ data: CustomerDetail }>({
    path: `customers/${encodeURIComponent(String(id))}`,
    signal,
  });
  return data;
}

export async function createCustomer(
  api: ApiClient,
  changes: CustomerChanges,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }, CustomerChanges>({
    path: 'customers',
    method: 'POST',
    json: changes,
  });
  return data;
}

export async function updateCustomer(
  api: ApiClient,
  id: number,
  changes: CustomerChanges,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }, CustomerChanges>({
    path: `customers/${id}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}

export async function fetchContacts(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<Contact[]> {
  const { data } = await api.request<{ data: Contact[] }>({
    path: 'contacts',
    signal,
  });
  return data;
}

export async function fetchContact(
  api: ApiClient,
  id: number | string,
  signal?: AbortSignal,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }>({
    path: `contacts/${encodeURIComponent(String(id))}`,
    signal,
  });
  return data;
}

export async function createContact(
  api: ApiClient,
  changes: ContactChanges,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }, ContactChanges>({
    path: 'contacts',
    method: 'POST',
    json: changes,
  });
  return data;
}

export async function updateContact(
  api: ApiClient,
  id: number,
  changes: ContactChanges,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }, ContactChanges>({
    path: `contacts/${id}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}

export async function fetchOpportunities(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<Opportunity[]> {
  const { data } = await api.request<{ data: Opportunity[] }>({
    path: 'opportunities',
    signal,
  });
  return data;
}

export async function fetchOpportunity(
  api: ApiClient,
  id: number | string,
  signal?: AbortSignal,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }>({
    path: `opportunities/${encodeURIComponent(String(id))}`,
    signal,
  });
  return data;
}

export async function createOpportunity(
  api: ApiClient,
  changes: OpportunityChanges,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }, OpportunityChanges>(
    {
      path: 'opportunities',
      method: 'POST',
      json: changes,
    },
  );
  return data;
}

export async function updateOpportunity(
  api: ApiClient,
  id: number,
  changes: OpportunityChanges,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }, OpportunityChanges>(
    {
      path: `opportunities/${id}`,
      method: 'PATCH',
      json: changes,
    },
  );
  return data;
}

/** Whether an error means the record behind the current view no longer exists. */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 404;
}
