import type { ApiClient } from '@nocobase/app-client';

import type {
  Contact,
  ContactInput,
  Customer,
  CustomerDetail,
  CustomerInput,
  Opportunity,
  OpportunityInput,
  OpportunityStage,
} from './types.js';

/**
 * The CRM API, as plain functions. A function cannot call hooks, so each one
 * takes the application's shared `ApiClient`; paths are relative to the client's
 * base URL and never spell `/api` themselves.
 */

export async function listCustomers(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<readonly Customer[]> {
  const { data } = await api.request<{ data: readonly Customer[] }>({
    path: 'customers',
    signal,
  });
  return data;
}

export async function fetchCustomerDetail(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<CustomerDetail> {
  const { data } = await api.request<{ data: CustomerDetail }>({
    path: `customers/${encodeURIComponent(id)}`,
    signal,
  });
  return data;
}

export async function createCustomer(
  api: ApiClient,
  input: CustomerInput,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }, CustomerInput>({
    path: 'customers',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateCustomer(
  api: ApiClient,
  id: number,
  input: CustomerInput,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }, CustomerInput>({
    path: `customers/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function listContacts(
  api: ApiClient,
  customerId?: number,
  signal?: AbortSignal,
): Promise<readonly Contact[]> {
  const { data } = await api.request<{ data: readonly Contact[] }>({
    path: 'contacts',
    query: customerId === undefined ? undefined : { customerId },
    signal,
  });
  return data;
}

export async function createContact(
  api: ApiClient,
  input: ContactInput,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }, ContactInput>({
    path: 'contacts',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateContact(
  api: ApiClient,
  id: number,
  input: ContactInput,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }, ContactInput>({
    path: `contacts/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function listOpportunities(
  api: ApiClient,
  stage?: OpportunityStage,
  signal?: AbortSignal,
): Promise<readonly Opportunity[]> {
  const { data } = await api.request<{ data: readonly Opportunity[] }>({
    path: 'opportunities',
    query: stage === undefined ? undefined : { stage },
    signal,
  });
  return data;
}

export async function createOpportunity(
  api: ApiClient,
  input: OpportunityInput,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }, OpportunityInput>({
    path: 'opportunities',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateOpportunity(
  api: ApiClient,
  id: number,
  input: OpportunityInput,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }, OpportunityInput>({
    path: `opportunities/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}
