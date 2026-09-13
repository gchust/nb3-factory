import { useMemo } from 'react';

import {
  apiClientToken,
  ApiClientError,
  resolveAppUrl,
  useService,
  type ApiClient,
} from '@nocobase/app-client';

export const OPPORTUNITY_STAGES = [
  'lead',
  'following',
  'quoted',
  'won',
  'lost',
] as const;
export const CUSTOMER_STATUSES = ['potential', 'active', 'lost'] as const;
export const CUSTOMER_SOURCES = ['online', 'referral', 'expo'] as const;
export const COMPANY_SIZES = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '500+',
] as const;
export const FOLLOW_UP_METHODS = ['phone', 'visit', 'email'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];
export type CompanySize = (typeof COMPANY_SIZES)[number];
export type FollowUpMethod = (typeof FOLLOW_UP_METHODS)[number];
export type AttachmentTarget = 'customer' | 'opportunity';

export type StoredDate = string | number | Date;

export interface Customer {
  id: number;
  name: string;
  industry: string | null;
  companySize: string | null;
  source: string | null;
  status: string;
  ownerId: string;
  notes: string | null;
  createdAt: StoredDate;
  updatedAt: StoredDate;
}

export interface Contact {
  id: number;
  customerId: number;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean | number;
  ownerId: string;
  createdAt: StoredDate;
  updatedAt: StoredDate;
}

export interface Opportunity {
  id: number;
  name: string;
  customerId: number;
  amount: number | string | null;
  stage: string;
  expectedCloseDate: StoredDate | null;
  ownerId: string;
  wonAmount: number | string | null;
  lostReason: string | null;
  createdAt: StoredDate;
  updatedAt: StoredDate;
}

export interface FollowUp {
  id: number;
  customerId: number | null;
  opportunityId: number | null;
  method: string;
  summary: string;
  nextStep: string | null;
  followedAt: StoredDate;
  ownerId: string;
  createdAt: StoredDate;
  updatedAt: StoredDate;
}

export interface Attachment {
  id: number;
  targetType: string;
  targetId: number;
  fileId: string;
  ownerId: string;
  createdAt: StoredDate;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
}

export interface FunnelRow {
  stage: string;
  count: number;
  total: number;
}

export interface FunnelStats {
  byStage: FunnelRow[];
  totalCount: number;
  totalAmount: number;
  newThisMonth: number;
  wonCount: number;
  closedCount: number;
  winRate: number | null;
}

export interface CrmRoles {
  admin: boolean;
  manager: boolean;
  representative: boolean;
}

export interface CrmSession {
  userId: string;
  roles: CrmRoles;
}

export interface OwnerOption {
  id: string;
  name: string;
  email: string;
}

export interface CustomerInput {
  name: string;
  industry?: string | null;
  companySize?: string | null;
  source?: string | null;
  status?: string;
  notes?: string | null;
  ownerId?: string;
}

export interface ContactInput {
  name: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
}

export interface OpportunityInput {
  name: string;
  customerId: number;
  amount?: number | null;
  stage: string;
  expectedCloseDate?: string | null;
  wonAmount?: number | null;
  lostReason?: string | null;
  ownerId?: string;
}

export interface FollowUpInput {
  method: string;
  summary: string;
  nextStep?: string | null;
  followedAt?: string | null;
  customerId?: number | null;
  opportunityId?: number | null;
}

interface Envelope<T> {
  data: T;
}

export interface CrmApi {
  me(): Promise<CrmSession>;
  owners(): Promise<OwnerOption[]>;
  listCustomers(filters?: {
    search?: string;
    status?: string;
  }): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer>;
  createCustomer(input: CustomerInput): Promise<{ id: number }>;
  updateCustomer(id: number, input: CustomerInput): Promise<void>;
  deleteCustomer(id: number): Promise<void>;
  assignCustomer(id: number, ownerId: string): Promise<void>;
  listContacts(customerId: number): Promise<Contact[]>;
  createContact(
    customerId: number,
    input: ContactInput,
  ): Promise<{ id: number }>;
  updateContact(id: number, input: ContactInput): Promise<void>;
  deleteContact(id: number): Promise<void>;
  listOpportunities(filters?: {
    stage?: string;
    customerId?: number;
  }): Promise<Opportunity[]>;
  createOpportunity(input: OpportunityInput): Promise<{ id: number }>;
  updateOpportunity(
    id: number,
    input: Partial<OpportunityInput>,
  ): Promise<void>;
  deleteOpportunity(id: number): Promise<void>;
  listFollowUps(filters?: {
    customerId?: number;
    opportunityId?: number;
  }): Promise<FollowUp[]>;
  createFollowUp(input: FollowUpInput): Promise<{ id: number }>;
  deleteFollowUp(id: number): Promise<void>;
  funnel(): Promise<FunnelStats>;
  listAttachments(
    targetType: AttachmentTarget,
    targetId: number,
  ): Promise<Attachment[]>;
  uploadAttachment(input: {
    targetType: AttachmentTarget;
    targetId: number;
    file: File;
  }): Promise<Attachment>;
  deleteAttachment(id: number): Promise<void>;
  attachmentContentUrl(id: number): string;
}

export function createCrmApi(api: ApiClient): CrmApi {
  return {
    async me() {
      const response = await api.request<Envelope<CrmSession>>({
        path: 'crm/me',
      });
      return response.data;
    },
    async owners() {
      const response = await api.request<Envelope<OwnerOption[]>>({
        path: 'crm/owners',
      });
      return response.data;
    },
    async listCustomers(filters = {}) {
      const response = await api.request<Envelope<Customer[]>>({
        path: 'crm/customers',
        query: {
          search: filters.search || undefined,
          status: filters.status || undefined,
        },
      });
      return response.data;
    },
    async getCustomer(id) {
      const response = await api.request<Envelope<Customer>>({
        path: `crm/customers/${id}`,
      });
      return response.data;
    },
    async createCustomer(input) {
      const response = await api.request<Envelope<{ id: number }>>({
        path: 'crm/customers',
        method: 'POST',
        json: input,
      });
      return response.data;
    },
    async updateCustomer(id, input) {
      await api.request({
        path: `crm/customers/${id}`,
        method: 'PATCH',
        json: input,
      });
    },
    async deleteCustomer(id) {
      await api.request({ path: `crm/customers/${id}`, method: 'DELETE' });
    },
    async assignCustomer(id, ownerId) {
      await api.request({
        path: `crm/customers/${id}/assign`,
        method: 'POST',
        json: { ownerId },
      });
    },
    async listContacts(customerId) {
      const response = await api.request<Envelope<Contact[]>>({
        path: `crm/customers/${customerId}/contacts`,
      });
      return response.data;
    },
    async createContact(customerId, input) {
      const response = await api.request<Envelope<{ id: number }>>({
        path: `crm/customers/${customerId}/contacts`,
        method: 'POST',
        json: input,
      });
      return response.data;
    },
    async updateContact(id, input) {
      await api.request({
        path: `crm/contacts/${id}`,
        method: 'PATCH',
        json: input,
      });
    },
    async deleteContact(id) {
      await api.request({ path: `crm/contacts/${id}`, method: 'DELETE' });
    },
    async listOpportunities(filters = {}) {
      const response = await api.request<Envelope<Opportunity[]>>({
        path: 'crm/opportunities',
        query: {
          stage: filters.stage || undefined,
          customerId: filters.customerId,
        },
      });
      return response.data;
    },
    async createOpportunity(input) {
      const response = await api.request<Envelope<{ id: number }>>({
        path: 'crm/opportunities',
        method: 'POST',
        json: input,
      });
      return response.data;
    },
    async updateOpportunity(id, input) {
      await api.request({
        path: `crm/opportunities/${id}`,
        method: 'PATCH',
        json: input,
      });
    },
    async deleteOpportunity(id) {
      await api.request({ path: `crm/opportunities/${id}`, method: 'DELETE' });
    },
    async listFollowUps(filters = {}) {
      const response = await api.request<Envelope<FollowUp[]>>({
        path: 'crm/follow-ups',
        query: {
          customerId: filters.customerId,
          opportunityId: filters.opportunityId,
        },
      });
      return response.data;
    },
    async createFollowUp(input) {
      const response = await api.request<Envelope<{ id: number }>>({
        path: 'crm/follow-ups',
        method: 'POST',
        json: input,
      });
      return response.data;
    },
    async deleteFollowUp(id) {
      await api.request({ path: `crm/follow-ups/${id}`, method: 'DELETE' });
    },
    async funnel() {
      const response = await api.request<Envelope<FunnelStats>>({
        path: 'crm/stats/funnel',
      });
      return response.data;
    },
    async listAttachments(targetType, targetId) {
      const response = await api.request<Envelope<Attachment[]>>({
        path: 'crm/attachments',
        query: { targetType, targetId },
      });
      return response.data;
    },
    async uploadAttachment({ targetType, targetId, file }) {
      const form = new FormData();
      form.append('targetType', targetType);
      form.append('targetId', String(targetId));
      form.append('file', file);
      const response = await api.request<Envelope<Attachment>>({
        path: 'crm/attachments',
        method: 'POST',
        body: form,
      });
      return response.data;
    },
    async deleteAttachment(id) {
      await api.request({ path: `crm/attachments/${id}`, method: 'DELETE' });
    },
    attachmentContentUrl(id) {
      return resolveAppUrl(`api/crm/attachments/${id}/content`);
    },
  };
}

export function useCrmApi(): CrmApi {
  const api = useService(apiClientToken);
  return useMemo(() => createCrmApi(api), [api]);
}

export function isCrmApiError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export function crmErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ApiClientError)) return undefined;
  const payload = error.payload;
  if (typeof payload !== 'object' || payload === null) return undefined;
  const code: unknown = Reflect.get(payload, 'code');
  return typeof code === 'string' ? code : undefined;
}

/** Database timestamps arrive as epoch milliseconds, sometimes suffixed with `.0`. */
export function toDate(value: StoredDate | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) {
    const date = new Date(Number(text));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
