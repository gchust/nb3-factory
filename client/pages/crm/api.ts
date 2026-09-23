import type { ApiClient } from '@nocobase/app-client';

/** The three opportunity stages. The stored value is the key; labels live in the locale files. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface CustomerRecord {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContactRecord {
  readonly id: number;
  readonly name: string;
  readonly contactInfo: string | null;
  readonly customerId: number;
  readonly customerName: string;
}

export interface OpportunityRecord {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly customerName: string;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

export interface CustomerDetailRecord extends CustomerRecord {
  readonly contacts: readonly ContactRecord[];
  readonly opportunities: readonly OpportunityRecord[];
  readonly opportunityAmountTotal: number;
}

export interface CustomerInput {
  readonly name: string;
  readonly industry?: string | null;
}

export interface ContactInput {
  readonly name: string;
  readonly contactInfo?: string | null;
  readonly customerId: number;
}

export interface OpportunityInput {
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

interface RequestOptions {
  readonly signal?: AbortSignal;
}

export async function listCustomers(
  api: ApiClient,
  options: RequestOptions = {},
): Promise<CustomerRecord[]> {
  const { data } = await api.request<{ data: CustomerRecord[] }>({
    path: 'crm/customers',
    signal: options.signal,
  });
  return data;
}

export async function getCustomer(
  api: ApiClient,
  id: number,
  options: RequestOptions = {},
): Promise<CustomerDetailRecord> {
  const { data } = await api.request<{ data: CustomerDetailRecord }>({
    path: `crm/customers/${encodeURIComponent(String(id))}`,
    signal: options.signal,
  });
  return data;
}

export async function createCustomer(
  api: ApiClient,
  input: CustomerInput,
): Promise<CustomerRecord> {
  const { data } = await api.request<{ data: CustomerRecord }>({
    path: 'crm/customers',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateCustomer(
  api: ApiClient,
  id: number,
  input: CustomerInput,
): Promise<CustomerRecord> {
  const { data } = await api.request<{ data: CustomerRecord }>({
    path: `crm/customers/${encodeURIComponent(String(id))}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function listContacts(
  api: ApiClient,
  options: RequestOptions = {},
): Promise<ContactRecord[]> {
  const { data } = await api.request<{ data: ContactRecord[] }>({
    path: 'crm/contacts',
    signal: options.signal,
  });
  return data;
}

export async function createContact(
  api: ApiClient,
  input: ContactInput,
): Promise<ContactRecord> {
  const { data } = await api.request<{ data: ContactRecord }>({
    path: 'crm/contacts',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateContact(
  api: ApiClient,
  id: number,
  input: ContactInput,
): Promise<ContactRecord> {
  const { data } = await api.request<{ data: ContactRecord }>({
    path: `crm/contacts/${encodeURIComponent(String(id))}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function listOpportunities(
  api: ApiClient,
  stage?: OpportunityStage,
  options: RequestOptions = {},
): Promise<OpportunityRecord[]> {
  const { data } = await api.request<{ data: OpportunityRecord[] }>({
    path: 'crm/opportunities',
    query: stage === undefined ? undefined : { stage },
    signal: options.signal,
  });
  return data;
}

export async function createOpportunity(
  api: ApiClient,
  input: OpportunityInput,
): Promise<OpportunityRecord> {
  const { data } = await api.request<{ data: OpportunityRecord }>({
    path: 'crm/opportunities',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateOpportunity(
  api: ApiClient,
  id: number,
  input: OpportunityInput,
): Promise<OpportunityRecord> {
  const { data } = await api.request<{ data: OpportunityRecord }>({
    path: `crm/opportunities/${encodeURIComponent(String(id))}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
