import type { ApiClient } from '@nocobase/app-client';

import {
  OPPORTUNITY_STAGES,
  type Contact,
  type Customer,
  type CustomerDetail,
  type Opportunity,
} from './types.js';

/**
 * The CRM endpoints on the server route. These are plain functions, so the
 * caller passes in the application's API client rather than reaching for a
 * global one.
 */
export interface CustomerQuery {
  readonly search?: string;
}

export interface ContactQuery {
  readonly search?: string;
  readonly customerId?: number;
}

export interface OpportunityQuery {
  readonly search?: string;
  readonly customerId?: number;
  readonly stage?: string;
}

export async function fetchCustomers(
  api: ApiClient,
  query: CustomerQuery = {},
  signal?: AbortSignal,
): Promise<Customer[]> {
  const { data } = await api.request<{ data: Customer[] }>({
    path: 'crm/customers',
    query: { search: query.search || undefined },
    signal,
  });
  return data;
}

export async function fetchCustomer(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }>({
    path: `crm/customers/${id}`,
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
    path: `crm/customers/${id}/detail`,
    signal,
  });
  return data;
}

export async function fetchContacts(
  api: ApiClient,
  query: ContactQuery = {},
  signal?: AbortSignal,
): Promise<Contact[]> {
  const { data } = await api.request<{ data: Contact[] }>({
    path: 'crm/contacts',
    query: {
      search: query.search || undefined,
      customerId: query.customerId,
    },
    signal,
  });
  return data;
}

export async function fetchContact(
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

export async function fetchOpportunities(
  api: ApiClient,
  query: OpportunityQuery = {},
  signal?: AbortSignal,
): Promise<Opportunity[]> {
  const { data } = await api.request<{ data: Opportunity[] }>({
    path: 'crm/opportunities',
    query: {
      search: query.search || undefined,
      customerId: query.customerId,
      stage: query.stage || undefined,
    },
    signal,
  });
  return data.map(normalizeOpportunity);
}

export async function fetchOpportunity(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<Opportunity> {
  const { data } = await api.request<{ data: Opportunity }>({
    path: `crm/opportunities/${id}`,
    signal,
  });
  return normalizeOpportunity(data);
}

/** The database stores the stage as text; only a known code reaches the UI. */
export function normalizeOpportunity(opportunity: Opportunity): Opportunity {
  const stage = OPPORTUNITY_STAGES.find(
    (candidate) => candidate === opportunity.stage,
  );
  return {
    ...opportunity,
    amount: Number(opportunity.amount ?? 0),
    stage: stage ?? 'follow_up',
  };
}
