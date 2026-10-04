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
 * The sales endpoints as plain functions. A component passes the shared
 * `ApiClient` in, so no request is built from `location` or a hard-coded
 * `/api` base — the client already knows the deployment base path.
 */

export async function fetchCustomers(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<Customer[]> {
  const { data } = await api.request<{ data: Customer[] }>({
    path: 'sales/customers',
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
    path: `sales/customers/${encodeURIComponent(id)}`,
    signal,
  });
  return data;
}

export async function createCustomer(
  api: ApiClient,
  input: CustomerInput,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }, CustomerInput>({
    path: 'sales/customers',
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
    path: `sales/customers/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function fetchContacts(
  api: ApiClient,
  signal?: AbortSignal,
  customerId?: number,
): Promise<Contact[]> {
  const { data } = await api.request<{ data: Contact[] }>({
    path: 'sales/contacts',
    query: customerId === undefined ? undefined : { customerId },
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
    path: `sales/contacts/${encodeURIComponent(id)}`,
    signal,
  });
  return data;
}

export async function createContact(
  api: ApiClient,
  input: ContactInput,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }, ContactInput>({
    path: 'sales/contacts',
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
    path: `sales/contacts/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function fetchOpportunities(
  api: ApiClient,
  signal?: AbortSignal,
  stage?: OpportunityStage,
): Promise<Opportunity[]> {
  const { data } = await api.request<{ data: Opportunity[] }>({
    path: 'sales/opportunities',
    query: stage === undefined ? undefined : { stage },
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
    path: `sales/opportunities/${encodeURIComponent(id)}`,
    signal,
  });
  return data;
}

export async function createOpportunity(
  api: ApiClient,
  input: OpportunityInput,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }, OpportunityInput>({
    path: 'sales/opportunities',
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
    path: `sales/opportunities/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}
