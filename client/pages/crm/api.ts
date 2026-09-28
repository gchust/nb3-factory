import type { ApiClient } from '@nocobase/app-client';

import type {
  Contact,
  ContactInput,
  Customer,
  CustomerDetail,
  CustomerInput,
  CustomerSummary,
  Opportunity,
  OpportunityInput,
  OpportunityListQuery,
} from './types.js';

/**
 * The CRM endpoints, as plain functions. A caller gets the client with
 * `useApiClient()` (components) or `this.app.services.resolve(apiClientToken)`
 * (providers) and passes it in; no path here includes `/api` or the deployment
 * base path, which the client already carries.
 */

export async function listCustomers(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<CustomerSummary[]> {
  const { data } = await api.request<{ data: CustomerSummary[] }>({
    path: 'crm/customers',
    signal,
  });
  return data;
}

export async function getCustomer(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<CustomerDetail> {
  const { data } = await api.request<{ data: CustomerDetail }>({
    path: `crm/customers/${id}`,
    signal,
  });
  return data;
}

export async function createCustomer(
  api: ApiClient,
  input: CustomerInput,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }, CustomerInput>({
    path: 'crm/customers',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateCustomer(
  api: ApiClient,
  id: number,
  input: Partial<CustomerInput>,
): Promise<Customer> {
  const { data } = await api.request<
    { data: Customer },
    Partial<CustomerInput>
  >({
    path: `crm/customers/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function listContacts(
  api: ApiClient,
  customerId?: number,
  signal?: AbortSignal,
): Promise<Contact[]> {
  const { data } = await api.request<{ data: Contact[] }>({
    path: 'crm/contacts',
    query: customerId === undefined ? undefined : { customerId },
    signal,
  });
  return data;
}

export async function getContact(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }>({
    path: `crm/contacts/${id}`,
    signal,
  });
  return data;
}

export async function createContact(
  api: ApiClient,
  input: ContactInput,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }, ContactInput>({
    path: 'crm/contacts',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateContact(
  api: ApiClient,
  id: number,
  input: Partial<ContactInput>,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }, Partial<ContactInput>>({
    path: `crm/contacts/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function listOpportunities(
  api: ApiClient,
  query: OpportunityListQuery = {},
  signal?: AbortSignal,
): Promise<Opportunity[]> {
  const { data } = await api.request<{ data: Opportunity[] }>({
    path: 'crm/opportunities',
    query:
      query.stage === undefined && query.customerId === undefined
        ? undefined
        : { stage: query.stage, customerId: query.customerId },
    signal,
  });
  return data;
}

export async function getOpportunity(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }>({
    path: `crm/opportunities/${id}`,
    signal,
  });
  return data;
}

export async function createOpportunity(
  api: ApiClient,
  input: OpportunityInput,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }, OpportunityInput>({
    path: 'crm/opportunities',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateOpportunity(
  api: ApiClient,
  id: number,
  input: Partial<OpportunityInput>,
): Promise<Opportunity> {
  const { data } = await api.request<
    { data: Opportunity },
    Partial<OpportunityInput>
  >({
    path: `crm/opportunities/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}
