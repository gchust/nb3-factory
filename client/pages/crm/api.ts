import type { ApiClient } from '@nocobase/app-client';

import type {
  Contact,
  Customer,
  CustomerDetail,
  Opportunity,
  OpportunityStage,
} from './types.js';

/** A plain module cannot call hooks, so each function takes the application's client. */

function idPath(value: string | number): string {
  return encodeURIComponent(String(value));
}

export interface CustomerChanges {
  readonly name?: string;
  readonly industry?: string | null;
}

export async function fetchCustomers(
  api: ApiClient,
  options: { readonly search?: string; readonly signal?: AbortSignal } = {},
): Promise<readonly Customer[]> {
  const { data } = await api.request<{ data: Customer[] }>({
    path: 'crm/customers',
    query: { search: options.search || undefined },
    signal: options.signal,
  });
  return data;
}

export async function fetchCustomerDetail(
  api: ApiClient,
  id: string | number,
  signal?: AbortSignal,
): Promise<CustomerDetail> {
  const { data } = await api.request<{ data: CustomerDetail }>({
    path: `crm/customers/${idPath(id)}`,
    signal,
  });
  return data;
}

export async function createCustomer(
  api: ApiClient,
  changes: Required<Pick<CustomerChanges, 'name'>> & CustomerChanges,
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
  id: string | number,
  changes: CustomerChanges,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }, CustomerChanges>({
    path: `crm/customers/${idPath(id)}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}

export interface ContactChanges {
  readonly name?: string;
  readonly customerId?: number;
  readonly phone?: string | null;
  readonly email?: string | null;
}

export async function fetchContacts(
  api: ApiClient,
  options: {
    readonly search?: string;
    readonly customerId?: number;
    readonly signal?: AbortSignal;
  } = {},
): Promise<readonly Contact[]> {
  const { data } = await api.request<{ data: Contact[] }>({
    path: 'crm/contacts',
    query: {
      search: options.search || undefined,
      customerId: options.customerId,
    },
    signal: options.signal,
  });
  return data;
}

export async function fetchContact(
  api: ApiClient,
  id: string | number,
  signal?: AbortSignal,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }>({
    path: `crm/contacts/${idPath(id)}`,
    signal,
  });
  return data;
}

export async function createContact(
  api: ApiClient,
  changes: Required<Pick<ContactChanges, 'name' | 'customerId'>> &
    ContactChanges,
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
  id: string | number,
  changes: ContactChanges,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }, ContactChanges>({
    path: `crm/contacts/${idPath(id)}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}

export interface OpportunityChanges {
  readonly name?: string;
  readonly customerId?: number;
  readonly amount?: number;
  readonly stage?: OpportunityStage;
}

export async function fetchOpportunities(
  api: ApiClient,
  options: {
    readonly search?: string;
    readonly stage?: OpportunityStage;
    readonly customerId?: number;
    readonly signal?: AbortSignal;
  } = {},
): Promise<readonly Opportunity[]> {
  const { data } = await api.request<{ data: Opportunity[] }>({
    path: 'crm/opportunities',
    query: {
      search: options.search || undefined,
      stage: options.stage,
      customerId: options.customerId,
    },
    signal: options.signal,
  });
  return data;
}

export async function fetchOpportunity(
  api: ApiClient,
  id: string | number,
  signal?: AbortSignal,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }>({
    path: `crm/opportunities/${idPath(id)}`,
    signal,
  });
  return data;
}

export async function createOpportunity(
  api: ApiClient,
  changes: Required<
    Pick<OpportunityChanges, 'name' | 'customerId' | 'amount' | 'stage'>
  >,
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
  id: string | number,
  changes: OpportunityChanges,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }, OpportunityChanges>(
    {
      path: `crm/opportunities/${idPath(id)}`,
      method: 'PATCH',
      json: changes,
    },
  );
  return data;
}
