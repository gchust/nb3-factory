import type { ApiClient } from '@nocobase/app-client';

import type {
  Contact,
  Customer,
  CustomerDetail,
  Opportunity,
  OpportunityStage,
} from './types.js';

export interface CustomerInput {
  readonly name: string;
  readonly industry: string | null;
}

export interface ContactInput {
  readonly name: string;
  readonly contact: string | null;
  readonly customerId: number;
}

export interface OpportunityInput {
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

function encodeId(id: number | string): string {
  return encodeURIComponent(String(id));
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

export async function fetchCustomer(
  api: ApiClient,
  id: number | string,
  signal?: AbortSignal,
): Promise<CustomerDetail> {
  const { data } = await api.request<{ data: CustomerDetail }>({
    path: `customers/${encodeId(id)}`,
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
  id: number | string,
  input: CustomerInput,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }, CustomerInput>({
    path: `customers/${encodeId(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function fetchContacts(
  api: ApiClient,
  query: { readonly customerId?: number } = {},
  signal?: AbortSignal,
): Promise<Contact[]> {
  const { data } = await api.request<{ data: Contact[] }>({
    path: 'contacts',
    query: { customerId: query.customerId },
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
  id: number | string,
  input: ContactInput,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }, ContactInput>({
    path: `contacts/${encodeId(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function fetchOpportunities(
  api: ApiClient,
  query: {
    readonly customerId?: number;
    readonly stage?: OpportunityStage;
  } = {},
  signal?: AbortSignal,
): Promise<Opportunity[]> {
  const { data } = await api.request<{ data: Opportunity[] }>({
    path: 'opportunities',
    query: { customerId: query.customerId, stage: query.stage },
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
  id: number | string,
  input: OpportunityInput,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }, OpportunityInput>({
    path: `opportunities/${encodeId(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

/** The field name a validation failure from the server belongs to, when it named one. */
export function validationField(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const payload = (error as { payload?: unknown }).payload;
  if (payload && typeof payload === 'object') {
    const field = (payload as { field?: unknown }).field;
    if (typeof field === 'string') return field;
  }
  return undefined;
}
