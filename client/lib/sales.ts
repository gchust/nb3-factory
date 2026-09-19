import { resolveAppUrl, useApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Shared client access to the sales API.
 *
 * Every request goes through the application's API client, so the deployment
 * base path is handled for us. `contentUrl` points at the application-owned
 * content route, which enforces the same customer permission as the API.
 */

export type Stage =
  | 'initial_contact'
  | 'needs_confirmation'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost';

export type Channel =
  'phone' | 'wechat' | 'email' | 'meeting' | 'visit' | 'other';
export type Importance = 'high' | 'normal' | 'low';
export type CustomerStatus = 'potential' | 'following' | 'signed' | 'lost';
export type DueState = 'overdue' | 'today' | 'upcoming' | 'none';
export type FileCategory = 'avatar' | 'opportunity' | 'followup';

export const STAGES: readonly Stage[] = [
  'initial_contact',
  'needs_confirmation',
  'proposal',
  'negotiation',
  'won',
  'lost',
];
export const OPEN_STAGES: readonly Stage[] = [
  'initial_contact',
  'needs_confirmation',
  'proposal',
  'negotiation',
];
export const CHANNELS: readonly Channel[] = [
  'phone',
  'wechat',
  'email',
  'meeting',
  'visit',
  'other',
];
export const IMPORTANCE_LEVELS: readonly Importance[] = [
  'high',
  'normal',
  'low',
];
export const CUSTOMER_STATUSES: readonly CustomerStatus[] = [
  'potential',
  'following',
  'signed',
  'lost',
];

export interface Owner {
  id: string;
  name: string;
}

export interface CustomerSummary {
  id: string;
  name: string;
  industry: string | null;
  source: string | null;
  importance: Importance;
  status: CustomerStatus;
  ownerId: string | null;
  ownerName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  avatarFileId: string | null;
  contactCount: number;
  opportunityCount: number;
  openOpportunityAmount: number;
  nextFollowUpAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Contact {
  id: string;
  customerId: string;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export interface Opportunity {
  id: string;
  customerId: string;
  customerName: string | null;
  name: string;
  amount: number;
  expectedCloseDate: string | null;
  stage: Stage;
  closeReason: string | null;
  ownerId: string | null;
  ownerName: string | null;
  isClosed: boolean;
}

export interface FollowUp {
  id: string;
  customerId: string;
  customerName: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  channel: Channel;
  content: string;
  occurredAt: string | null;
  nextFollowUpAt: string | null;
  dueState: DueState;
}

export interface SalesFile {
  id: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  category: FileCategory | null;
  customerId: string | null;
  opportunityId: string | null;
  followUpId: string | null;
  uploadedById: string | null;
  uploadedByName: string | null;
  createdAt: string | null;
  contentUrl: string;
}

export interface CustomerDetail extends CustomerSummary {
  contacts: Contact[];
  opportunities: Opportunity[];
  followUps: FollowUp[];
  files: SalesFile[];
}

export interface OpportunityDetail extends Opportunity {
  followUps: FollowUp[];
  files: SalesFile[];
}

export interface FollowUpDetail extends FollowUp {
  files: SalesFile[];
}

export interface DashboardData {
  customerCount: number;
  openOpportunityCount: number;
  openOpportunityAmount: number;
  stageCounts: { stage: Stage; count: number; amount: number }[];
  followUp: { overdue: number; today: number; upcoming: number };
  customersNeedingFollowUp: {
    customerId: string;
    customerName: string | null;
    nextFollowUpAt: string;
    dueState: DueState;
  }[];
}

export interface CustomerPayload {
  name: string;
  industry?: string | null;
  source?: string | null;
  importance?: Importance;
  status?: CustomerStatus;
  ownerId?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface ContactPayload {
  name: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
}

export interface OpportunityPayload {
  customerId: string;
  name: string;
  amount?: number;
  expectedCloseDate?: string | null;
  stage?: Stage;
  closeReason?: string | null;
}

export interface FollowUpPayload {
  customerId: string;
  opportunityId?: string | null;
  channel?: Channel;
  content: string;
  occurredAt?: string;
  nextFollowUpAt?: string | null;
}

export interface FileAssociationInput {
  category: FileCategory;
  customerId?: string;
  opportunityId?: string;
  followUpId?: string;
}

export interface UploadResult {
  data: SalesFile[];
}

export function contentUrl(
  file: Pick<SalesFile, 'id'>,
  download = false,
): string {
  const url = resolveAppUrl(
    `/api/sales/files/${encodeURIComponent(file.id)}/content`,
  );
  return download ? `${url}?download=1` : url;
}

export function useSalesApi() {
  const api = useApiClient();
  return useMemo(
    () => ({
      dashboard: () =>
        api.request<{ data: DashboardData }>({ path: 'sales/dashboard' }),
      owners: () => api.request<{ data: Owner[] }>({ path: 'sales/owners' }),
      customers: (query: Record<string, string> = {}) =>
        api.request<{ data: CustomerSummary[] }>({
          path: 'sales/customers',
          query,
        }),
      customer: (id: string) =>
        api.request<{ data: CustomerDetail }>({
          path: `sales/customers/${encodeURIComponent(id)}`,
        }),
      createCustomer: (json: CustomerPayload) =>
        api.request<{ data: CustomerSummary }>({
          path: 'sales/customers',
          method: 'POST',
          json,
        }),
      updateCustomer: (id: string, json: Partial<CustomerPayload>) =>
        api.request<{ data: CustomerSummary }>({
          path: `sales/customers/${encodeURIComponent(id)}`,
          method: 'PATCH',
          json,
        }),
      uploadAvatar: (id: string, file: File) => {
        const body = new FormData();
        body.append('file', file);
        return api.request<{ data: SalesFile }>({
          path: `sales/customers/${encodeURIComponent(id)}/avatar`,
          method: 'POST',
          body,
        });
      },
      removeAvatar: (id: string) =>
        api.request<{ data: { removed: number } }>({
          path: `sales/customers/${encodeURIComponent(id)}/avatar`,
          method: 'DELETE',
        }),
      contacts: (customerId: string) =>
        api.request<{ data: Contact[] }>({
          path: `sales/customers/${encodeURIComponent(customerId)}/contacts`,
        }),
      createContact: (customerId: string, json: ContactPayload) =>
        api.request<{ data: Contact }>({
          path: `sales/customers/${encodeURIComponent(customerId)}/contacts`,
          method: 'POST',
          json,
        }),
      updateContact: (id: string, json: Partial<ContactPayload>) =>
        api.request<{ data: Contact }>({
          path: `sales/contacts/${encodeURIComponent(id)}`,
          method: 'PATCH',
          json,
        }),
      deleteContact: (id: string) =>
        api.request<void>({
          path: `sales/contacts/${encodeURIComponent(id)}`,
          method: 'DELETE',
        }),
      opportunities: (query: Record<string, string> = {}) =>
        api.request<{ data: Opportunity[] }>({
          path: 'sales/opportunities',
          query,
        }),
      opportunity: (id: string) =>
        api.request<{ data: OpportunityDetail }>({
          path: `sales/opportunities/${encodeURIComponent(id)}`,
        }),
      createOpportunity: (json: OpportunityPayload) =>
        api.request<{ data: Opportunity }>({
          path: 'sales/opportunities',
          method: 'POST',
          json,
        }),
      updateOpportunity: (id: string, json: Partial<OpportunityPayload>) =>
        api.request<{ data: Opportunity }>({
          path: `sales/opportunities/${encodeURIComponent(id)}`,
          method: 'PATCH',
          json,
        }),
      followUps: (query: Record<string, string> = {}) =>
        api.request<{ data: FollowUp[] }>({ path: 'sales/followups', query }),
      followUp: (id: string) =>
        api.request<{ data: FollowUpDetail }>({
          path: `sales/followups/${encodeURIComponent(id)}`,
        }),
      createFollowUp: (json: FollowUpPayload) =>
        api.request<{ data: FollowUp }>({
          path: 'sales/followups',
          method: 'POST',
          json,
        }),
      files: (query: Record<string, string>) =>
        api.request<{ data: SalesFile[] }>({ path: 'sales/files', query }),
      uploadFiles: (association: FileAssociationInput, files: File[]) => {
        const body = new FormData();
        for (const file of files) body.append('file', file);
        body.append('category', association.category);
        if (association.customerId)
          body.append('customerId', association.customerId);
        if (association.opportunityId) {
          body.append('opportunityId', association.opportunityId);
        }
        if (association.followUpId)
          body.append('followUpId', association.followUpId);
        return api.request<UploadResult>({
          path: 'sales/files',
          method: 'POST',
          body,
        });
      },
      deleteFile: (id: string) =>
        api.request<void>({
          path: `sales/files/${encodeURIComponent(id)}`,
          method: 'DELETE',
        }),
    }),
    [api],
  );
}

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
}

interface LoadState<T> {
  status: 'loading' | 'ready' | 'error';
  data?: T;
  error?: string;
}

/**
 * Loads a value and exposes its loading, error and data states.
 *
 * `key` is the request identity: changing it (or calling `reload`) starts a new
 * request. The loader itself is held in a ref so the newest closure is used
 * without making every render a new request, and state is only written from an
 * async callback.
 */
export function useLoad<T>(
  key: string,
  loader: () => Promise<T>,
): AsyncState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let active = true;
    loaderRef
      .current()
      .then((data) => {
        if (active) setState({ status: 'ready', data });
      })
      .catch((cause: unknown) => {
        if (active) setState({ status: 'error', error: errorMessage(cause) });
      });
    return () => {
      active = false;
    };
  }, [key, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return {
    data: state.data,
    loading: state.status === 'loading',
    error: state.error,
    reload,
  };
}

export function errorMessage(cause: unknown): string {
  if (cause && typeof cause === 'object') {
    const record = cause as { payload?: unknown; message?: unknown };
    const payload = record.payload as { message?: unknown } | undefined;
    if (payload && typeof payload.message === 'string' && payload.message) {
      return payload.message;
    }
    if (typeof record.message === 'string' && record.message) {
      return record.message;
    }
  }
  return '';
}

export function formatAmount(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function nowLocalInput(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 5;

export function fileProblem(file: File): string | undefined {
  if (file.size > MAX_FILE_BYTES) return 'tooLarge';
  const extension = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
    : '';
  const denied = [
    'html',
    'htm',
    'xhtml',
    'svg',
    'js',
    'mjs',
    'cjs',
    'jsx',
    'ts',
    'tsx',
    'php',
    'phtml',
    'exe',
    'dll',
    'com',
    'scr',
    'bat',
    'cmd',
    'sh',
    'ps1',
    'jar',
    'msi',
    'vbs',
    'apk',
    'app',
    'deb',
    'rpm',
    'so',
    'dylib',
  ];
  if (extension && denied.includes(extension)) return 'unsupported';
  return undefined;
}

export function canPreview(file: Pick<SalesFile, 'mimeType' | 'ext'>): boolean {
  const mime = file.mimeType.toLowerCase();
  return (
    [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/bmp',
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
    ].includes(mime) ||
    [
      'png',
      'jpg',
      'jpeg',
      'gif',
      'webp',
      'bmp',
      'pdf',
      'txt',
      'md',
      'csv',
    ].includes(file.ext.toLowerCase())
  );
}

export function isImage(file: Pick<SalesFile, 'mimeType' | 'ext'>): boolean {
  return (
    file.mimeType.toLowerCase().startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(
      file.ext.toLowerCase(),
    )
  );
}

export function isText(file: Pick<SalesFile, 'mimeType' | 'ext'>): boolean {
  return (
    file.mimeType.toLowerCase().startsWith('text/') ||
    ['txt', 'md', 'csv'].includes(file.ext.toLowerCase())
  );
}
