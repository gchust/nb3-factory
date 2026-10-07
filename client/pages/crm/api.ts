import type { ApiClient } from '@nocobase/app-client';

import type {
  ContactView,
  CustomerDetailView,
  CustomerView,
  DashboardView,
  FollowUpView,
  GenerateSuggestionsResult,
  ImportCommitResult,
  ImportPreview,
  ImportRowInput,
  ListResponse,
  OpportunityView,
  SuggestionView,
} from './types.js';

/**
 * The plain functions the CRM pages call. A plain function cannot read a
 * hook, so the caller passes the client it got from `useApiClient()`.
 */

export interface CustomerListParams {
  [key: string]: string | number | boolean | null | undefined;
  search?: string;
  level?: string;
  ownerId?: string;
  page?: number;
  pageSize?: number;
  sort?: 'newest' | 'oldest' | 'name';
}

export interface ContactListParams {
  [key: string]: string | number | boolean | null | undefined;
  customerId?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface OpportunityListParams {
  [key: string]: string | number | boolean | null | undefined;
  customerId?: number;
  stage?: string;
  ownerId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: 'newest' | 'oldest' | 'amount' | 'expectedCloseDate';
}

export interface FollowUpListParams {
  [key: string]: string | number | boolean | null | undefined;
  customerId?: number;
  status?: string;
  ownerId?: string;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
  sort?: 'newest' | 'oldest' | 'dueAt';
}

export interface CustomerChanges {
  name?: string;
  ownerId?: string | null;
  industry?: string | null;
  level?: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  source?: string | null;
  notes?: string | null;
}

export interface ContactChanges {
  name?: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
}

export interface OpportunityChanges {
  name?: string;
  stage?: string;
  amount?: number;
  expectedCloseDate?: string | null;
  lostReason?: string | null;
  notes?: string | null;
}

export interface FollowUpChanges {
  opportunityId?: number | null;
  method?: string;
  content?: string | null;
  status?: string;
  dueAt?: string | null;
}

const id = (value: number): string => encodeURIComponent(String(value));

// --- Customers ---------------------------------------------------------------

export async function fetchCustomers(
  api: ApiClient,
  params: CustomerListParams,
  signal?: AbortSignal,
): Promise<ListResponse<CustomerView>> {
  return api.request<ListResponse<CustomerView>>({
    path: 'crm/customers',
    query: params,
    signal,
  });
}

export async function fetchCustomer(
  api: ApiClient,
  customerId: number,
  signal?: AbortSignal,
): Promise<CustomerView> {
  const { data } = await api.request<{ data: CustomerView }>({
    path: `crm/customers/${id(customerId)}`,
    signal,
  });
  return data;
}

export async function fetchCustomerDetail(
  api: ApiClient,
  customerId: number,
  signal?: AbortSignal,
): Promise<CustomerDetailView> {
  const { data } = await api.request<{ data: CustomerDetailView }>({
    path: `crm/customers/${id(customerId)}/detail`,
    signal,
  });
  return data;
}

export async function createCustomer(
  api: ApiClient,
  changes: CustomerChanges,
): Promise<CustomerView> {
  const { data } = await api.request<{ data: CustomerView }, CustomerChanges>({
    path: 'crm/customers',
    method: 'POST',
    json: changes,
  });
  return data;
}

export async function updateCustomer(
  api: ApiClient,
  customerId: number,
  changes: CustomerChanges,
): Promise<CustomerView> {
  const { data } = await api.request<{ data: CustomerView }, CustomerChanges>({
    path: `crm/customers/${id(customerId)}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}

export async function deleteCustomer(
  api: ApiClient,
  customerId: number,
): Promise<void> {
  await api.request<void>({
    path: `crm/customers/${id(customerId)}`,
    method: 'DELETE',
  });
}

// --- Contacts ----------------------------------------------------------------

export async function fetchContacts(
  api: ApiClient,
  params: ContactListParams,
  signal?: AbortSignal,
): Promise<ListResponse<ContactView>> {
  return api.request<ListResponse<ContactView>>({
    path: 'crm/contacts',
    query: params,
    signal,
  });
}

export async function createContact(
  api: ApiClient,
  customerId: number,
  changes: ContactChanges,
): Promise<ContactView> {
  const { data } = await api.request<{ data: ContactView }, unknown>({
    path: 'crm/contacts',
    method: 'POST',
    json: { customerId, ...changes },
  });
  return data;
}

export async function updateContact(
  api: ApiClient,
  contactId: number,
  changes: ContactChanges,
): Promise<ContactView> {
  const { data } = await api.request<{ data: ContactView }, ContactChanges>({
    path: `crm/contacts/${id(contactId)}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}

export async function deleteContact(
  api: ApiClient,
  contactId: number,
): Promise<void> {
  await api.request<void>({
    path: `crm/contacts/${id(contactId)}`,
    method: 'DELETE',
  });
}

// --- Opportunities -----------------------------------------------------------

export async function fetchOpportunities(
  api: ApiClient,
  params: OpportunityListParams,
  signal?: AbortSignal,
): Promise<ListResponse<OpportunityView>> {
  return api.request<ListResponse<OpportunityView>>({
    path: 'crm/opportunities',
    query: params,
    signal,
  });
}

export async function createOpportunity(
  api: ApiClient,
  customerId: number,
  changes: OpportunityChanges,
): Promise<OpportunityView> {
  const { data } = await api.request<{ data: OpportunityView }, unknown>({
    path: 'crm/opportunities',
    method: 'POST',
    json: { customerId, ...changes },
  });
  return data;
}

export async function updateOpportunity(
  api: ApiClient,
  opportunityId: number,
  changes: OpportunityChanges,
): Promise<OpportunityView> {
  const { data } = await api.request<
    { data: OpportunityView },
    OpportunityChanges
  >({
    path: `crm/opportunities/${id(opportunityId)}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}

export async function deleteOpportunity(
  api: ApiClient,
  opportunityId: number,
): Promise<void> {
  await api.request<void>({
    path: `crm/opportunities/${id(opportunityId)}`,
    method: 'DELETE',
  });
}

// --- Follow-ups --------------------------------------------------------------

export async function fetchFollowUps(
  api: ApiClient,
  params: FollowUpListParams,
  signal?: AbortSignal,
): Promise<ListResponse<FollowUpView>> {
  return api.request<ListResponse<FollowUpView>>({
    path: 'crm/followUps',
    query: params,
    signal,
  });
}

export async function createFollowUp(
  api: ApiClient,
  customerId: number,
  changes: FollowUpChanges,
): Promise<FollowUpView> {
  const { data } = await api.request<{ data: FollowUpView }, unknown>({
    path: 'crm/followUps',
    method: 'POST',
    json: { customerId, ...changes },
  });
  return data;
}

export async function updateFollowUp(
  api: ApiClient,
  followUpId: number,
  changes: FollowUpChanges,
): Promise<FollowUpView> {
  const { data } = await api.request<{ data: FollowUpView }, FollowUpChanges>({
    path: `crm/followUps/${id(followUpId)}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}

export async function deleteFollowUp(
  api: ApiClient,
  followUpId: number,
): Promise<void> {
  await api.request<void>({
    path: `crm/followUps/${id(followUpId)}`,
    method: 'DELETE',
  });
}

// --- Dashboard ---------------------------------------------------------------

export async function fetchDashboard(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<DashboardView> {
  const { data } = await api.request<{ data: DashboardView }>({
    path: 'crm/dashboard',
    signal,
  });
  return data;
}

export async function fetchReminders(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<FollowUpView[]> {
  const { data } = await api.request<{ data: FollowUpView[] }>({
    path: 'crm/followUps/reminders',
    signal,
  });
  return data;
}

// --- Import ------------------------------------------------------------------

export async function previewImport(
  api: ApiClient,
  rows: readonly ImportRowInput[],
): Promise<ImportPreview> {
  const { data } = await api.request<{ data: ImportPreview }, unknown>({
    path: 'crm/customers/importPreview',
    method: 'POST',
    json: { rows },
  });
  return data;
}

export async function commitImport(
  api: ApiClient,
  rows: readonly ImportRowInput[],
): Promise<ImportCommitResult> {
  const { data } = await api.request<{ data: ImportCommitResult }, unknown>({
    path: 'crm/customers/import',
    method: 'POST',
    json: { rows },
  });
  return data;
}

// --- Suggestions -------------------------------------------------------------

export async function fetchSuggestions(
  api: ApiClient,
  status?: string,
  signal?: AbortSignal,
): Promise<SuggestionView[]> {
  const { data } = await api.request<{ data: SuggestionView[] }>({
    path: 'crm/suggestions',
    query: status ? { status } : undefined,
    signal,
  });
  return data;
}

export async function generateSuggestions(
  api: ApiClient,
): Promise<GenerateSuggestionsResult> {
  const { data } = await api.request<{ data: GenerateSuggestionsResult }>({
    path: 'crm/suggestions/generate',
    method: 'POST',
  });
  return data;
}

export async function decideSuggestion(
  api: ApiClient,
  suggestionId: number,
  decision: 'approve' | 'dismiss',
): Promise<SuggestionView> {
  const { data } = await api.request<{ data: SuggestionView }, unknown>({
    path: `crm/suggestions/${id(suggestionId)}/decide`,
    method: 'POST',
    json: { decision },
  });
  return data;
}
