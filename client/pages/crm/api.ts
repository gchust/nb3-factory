import type { ApiClient } from '@nocobase/app-client';

import type {
  Contact,
  Customer,
  CustomerSummary,
  Opportunity,
  OpportunityStage,
} from './types.js';

/**
 * CRM endpoint calls. Each function takes the application's HTTP client
 * because a plain function cannot call `useApiClient()`. Paths are relative to
 * the API base URL, so no `/api` and no deployment prefix.
 */

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
  readonly stage?: OpportunityStage;
}

export async function listCustomers(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<Customer[]> {
  const { data } = await api.request<{ data: Customer[] }>({
    path: 'crm/customers',
    signal,
  });
  return data;
}

export async function getCustomer(
  api: ApiClient,
  id: number | string,
  signal?: AbortSignal,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }>({
    path: `crm/customers/${encodeURIComponent(id)}`,
    signal,
  });
  return data;
}

export async function getCustomerSummary(
  api: ApiClient,
  id: number | string,
  signal?: AbortSignal,
): Promise<CustomerSummary> {
  const { data } = await api.request<{ data: CustomerSummary }>({
    path: `crm/customers/${encodeURIComponent(id)}/summary`,
    signal,
  });
  return data;
}

export async function createCustomer(
  api: ApiClient,
  changes: CustomerChanges,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }, CustomerChanges>({
    path: 'crm/customers',
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
    path: `crm/customers/${id}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}

export async function listContacts(
  api: ApiClient,
  options: { readonly customerId?: number } = {},
  signal?: AbortSignal,
): Promise<Contact[]> {
  const { data } = await api.request<{ data: Contact[] }>({
    path: 'crm/contacts',
    query: { customerId: options.customerId },
    signal,
  });
  return data;
}

export async function getContact(
  api: ApiClient,
  id: number | string,
  signal?: AbortSignal,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }>({
    path: `crm/contacts/${encodeURIComponent(id)}`,
    signal,
  });
  return data;
}

export async function createContact(
  api: ApiClient,
  changes: ContactChanges,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }, ContactChanges>({
    path: 'crm/contacts',
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
    path: `crm/contacts/${id}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}

export async function listOpportunities(
  api: ApiClient,
  options: {
    readonly customerId?: number;
    readonly stage?: OpportunityStage;
  } = {},
  signal?: AbortSignal,
): Promise<Opportunity[]> {
  const { data } = await api.request<{ data: Opportunity[] }>({
    path: 'crm/opportunities',
    query: { customerId: options.customerId, stage: options.stage },
    signal,
  });
  return data;
}

export async function getOpportunity(
  api: ApiClient,
  id: number | string,
  signal?: AbortSignal,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }>({
    path: `crm/opportunities/${encodeURIComponent(id)}`,
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
      path: 'crm/opportunities',
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
      path: `crm/opportunities/${id}`,
      method: 'PATCH',
      json: changes,
    },
  );
  return data;
}
