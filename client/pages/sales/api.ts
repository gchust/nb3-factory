import type { ApiClient } from '@nocobase/app-client';

import type {
  Contact,
  CustomerDetail,
  CustomerSummary,
  Opportunity,
  OpportunityStage,
} from './types.js';

export interface CustomerInput {
  readonly name: string;
  readonly industry: string | null;
}

export interface ContactInput {
  readonly name: string;
  readonly contactInfo: string | null;
  readonly customerId: number;
}

export interface OpportunityInput {
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

// Plain functions cannot call hooks: the caller passes the client in.

export async function fetchCustomers(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<CustomerSummary[]> {
  const { data } = await api.request<{ data: CustomerSummary[] }>({
    path: 'customers',
    signal,
  });
  return data;
}

export async function fetchCustomer(
  api: ApiClient,
  id: number | string,
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
): Promise<CustomerSummary> {
  const { data } = await api.request<{ data: CustomerSummary }, CustomerInput>({
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
): Promise<CustomerSummary> {
  const { data } = await api.request<{ data: CustomerSummary }, CustomerInput>({
    path: `customers/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function fetchContacts(
  api: ApiClient,
  customerId?: number,
  signal?: AbortSignal,
): Promise<Contact[]> {
  const { data } = await api.request<{ data: Contact[] }>({
    path: 'contacts',
    query: { customerId },
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
    path: `contacts/${encodeURIComponent(id)}`,
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
    path: `contacts/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export interface OpportunityQuery {
  readonly stage?: OpportunityStage;
  readonly customerId?: number;
}

export async function fetchOpportunities(
  api: ApiClient,
  query: OpportunityQuery,
  signal?: AbortSignal,
): Promise<Opportunity[]> {
  const { data } = await api.request<{ data: Opportunity[] }>({
    path: 'opportunities',
    query: { stage: query.stage, customerId: query.customerId },
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
    path: `opportunities/${encodeURIComponent(id)}`,
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
    path: `opportunities/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}
