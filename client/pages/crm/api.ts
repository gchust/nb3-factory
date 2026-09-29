import type { ApiClient } from '@nocobase/app-client';

import type {
  Contact,
  Customer,
  CustomerDetail,
  Opportunity,
  OpportunityStage,
} from './types.js';

export interface CustomerPayload {
  readonly name: string;
  readonly industry: string | null;
}

export interface ContactPayload {
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
}

export interface OpportunityPayload {
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

export async function listCustomers(
  api: ApiClient,
  search?: string,
): Promise<Customer[]> {
  const { data } = await api.request<{ data: Customer[] }>({
    path: 'customers',
    method: 'GET',
    ...(search ? { query: { search } } : {}),
  });
  return data;
}

export async function getCustomer(
  api: ApiClient,
  id: number,
): Promise<CustomerDetail> {
  const { data } = await api.request<{ data: CustomerDetail }>({
    path: `customers/${id}`,
    method: 'GET',
  });
  return data;
}

export async function createCustomer(
  api: ApiClient,
  payload: CustomerPayload,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }>({
    path: 'customers',
    method: 'POST',
    json: payload,
  });
  return data;
}

export async function updateCustomer(
  api: ApiClient,
  id: number,
  payload: CustomerPayload,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }>({
    path: `customers/${id}`,
    method: 'PATCH',
    json: payload,
  });
  return data;
}

export async function listContacts(
  api: ApiClient,
  options: { readonly search?: string; readonly customerId?: number } = {},
): Promise<Contact[]> {
  const query: Record<string, string | number> = {};
  if (options.search) query.search = options.search;
  if (options.customerId !== undefined) query.customerId = options.customerId;

  const { data } = await api.request<{ data: Contact[] }>({
    path: 'contacts',
    method: 'GET',
    ...(Object.keys(query).length > 0 ? { query } : {}),
  });
  return data;
}

export async function getContact(api: ApiClient, id: number): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }>({
    path: `contacts/${id}`,
    method: 'GET',
  });
  return data;
}

export async function createContact(
  api: ApiClient,
  payload: ContactPayload,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }>({
    path: 'contacts',
    method: 'POST',
    json: payload,
  });
  return data;
}

export async function updateContact(
  api: ApiClient,
  id: number,
  payload: ContactPayload,
): Promise<Contact> {
  const { data } = await api.request<{ data: Contact }>({
    path: `contacts/${id}`,
    method: 'PATCH',
    json: payload,
  });
  return data;
}

export async function listOpportunities(
  api: ApiClient,
  options: {
    readonly search?: string;
    readonly stage?: OpportunityStage;
    readonly customerId?: number;
  } = {},
): Promise<Opportunity[]> {
  const query: Record<string, string | number> = {};
  if (options.search) query.search = options.search;
  if (options.stage) query.stage = options.stage;
  if (options.customerId !== undefined) query.customerId = options.customerId;

  const { data } = await api.request<{ data: Opportunity[] }>({
    path: 'opportunities',
    method: 'GET',
    ...(Object.keys(query).length > 0 ? { query } : {}),
  });
  return data;
}

export async function getOpportunity(
  api: ApiClient,
  id: number,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }>({
    path: `opportunities/${id}`,
    method: 'GET',
  });
  return data;
}

export async function createOpportunity(
  api: ApiClient,
  payload: OpportunityPayload,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }>({
    path: 'opportunities',
    method: 'POST',
    json: payload,
  });
  return data;
}

export async function updateOpportunity(
  api: ApiClient,
  id: number,
  payload: OpportunityPayload,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }>({
    path: `opportunities/${id}`,
    method: 'PATCH',
    json: payload,
  });
  return data;
}
