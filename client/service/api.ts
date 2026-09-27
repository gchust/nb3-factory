import {
  ApiClientError,
  resolveAppUrl,
  useApiClient,
} from '@nocobase/app-client';
import type { ApiClient } from '@nocobase/app-client';
import type { FileRecord } from '@nocobase/app-plugin-file/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { asText } from './format.js';

/**
 * The browser side of the after-sales service API.
 *
 * Every call goes through the application's own `ApiClient`, so the session
 * cookie, the deployment base path and the CSRF handling are the same ones the
 * rest of the application uses. The server re-checks permissions on every
 * request; nothing here is a security decision.
 */

export interface Row {
  readonly [key: string]: unknown;
}

export interface ServiceIdentity {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly membershipIds: readonly string[];
  readonly regions: readonly string[];
  readonly manageAll: boolean;
  readonly allTickets: boolean;
  readonly regionTickets: boolean;
  readonly assignedTickets: boolean;
  readonly sharedTickets: boolean;
  readonly internalFields: boolean;
  readonly manageKnowledge: boolean;
  readonly manageInspections: boolean;
  readonly shareTickets: boolean;
  readonly integrationEvents: boolean;
  readonly assistant: boolean;
  readonly customers: string;
  readonly devices: string;
}

export interface Customer extends Row {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly region: string;
  readonly status: string;
}

export interface Device extends Row {
  readonly id: number;
  readonly serialNumber: string;
  readonly name: string;
  readonly region: string;
  readonly customerId: number;
}

export interface Ticket extends Row {
  readonly id: number;
  readonly serial: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly region: string;
  readonly confidential: boolean;
  readonly overdue: boolean;
}

export interface TicketLog extends Row {
  readonly id: number;
  readonly kind: string;
  readonly content: string;
}

export interface KnowledgeArticle extends Row {
  readonly id: number;
  readonly title: string;
  readonly status: string;
  readonly category: string;
}

export interface InspectionTask extends Row {
  readonly id: number;
  readonly deviceSerial: string;
  readonly runDate: string;
  readonly status: string;
}

export interface InspectionPlan extends Row {
  readonly id: number;
  readonly name: string;
  readonly deviceSerial: string;
  readonly enabled: boolean;
  readonly cron: string;
  readonly timezone: string;
}

export interface AttachmentRecord extends Row {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number | string;
  readonly ticketId: number | null;
  readonly knowledgeArticleId: number | null;
  readonly contentUrl: string;
}

export interface InboxItem {
  readonly id: string;
  readonly deliveryId: string;
  readonly notificationId: string;
  readonly userId: string;
  readonly title?: string;
  readonly body: string;
  readonly target?: { readonly type?: string; readonly path?: string };
  readonly readAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DeliveryRecord extends Row {
  readonly id: number;
  readonly channel: string;
  readonly status: string;
  readonly recipientId: string | null;
  readonly title: string;
  readonly attempts: number;
  readonly lastError: string | null;
}

export interface AssistantStatus {
  readonly available: boolean;
  readonly mode: 'knowledge-search' | 'model';
  readonly modelConfigured: boolean;
  readonly knowledgeSearch: boolean;
  readonly reason?: string;
}

export interface AssistantProposal {
  readonly id: string;
  readonly kind: 'ticket-action' | 'knowledge-draft';
  readonly label: string;
  readonly requiresConfirmation: boolean;
  readonly ticketId?: number;
  readonly action?: string;
  readonly payload?: Record<string, unknown>;
}

export interface AssistantAnswer {
  readonly question: string;
  readonly status: AssistantStatus;
  readonly answer: string;
  readonly citations: readonly {
    readonly type: string;
    readonly id: number;
    readonly title: string;
    readonly snippet: string;
  }[];
  readonly proposals: readonly AssistantProposal[];
}

export interface DashboardCounts {
  readonly tickets: {
    readonly total: number;
    readonly byStatus: Readonly<Record<string, number>>;
    readonly overdue: number;
    readonly confidential: number;
  };
  readonly devices: { readonly total: number; readonly enabled: number };
  readonly customers: { readonly total: number };
  readonly inspections: {
    readonly today: number;
    readonly pending: number;
    readonly completed: number;
    readonly plans: number;
  };
  readonly knowledge: { readonly published: number; readonly draft: number };
  readonly deliveries: {
    readonly notConfigured: number;
    readonly failed: number;
  };
}

export interface Dashboard {
  readonly scope: {
    readonly regions: readonly string[];
    readonly unrestricted: boolean;
  };
  readonly counts: DashboardCounts;
  readonly recentTickets: readonly Ticket[];
  readonly overdueTickets: readonly Ticket[];
}

export interface Paged<T> {
  readonly rows: readonly T[];
  readonly total: number;
}

export interface Envelope<T> {
  readonly data: T;
  readonly meta?: Record<string, unknown>;
}

export type ServiceQuery = Readonly<
  Record<
    string,
    | string
    | number
    | boolean
    | null
    | undefined
    | readonly (string | number | boolean | null)[]
  >
>;

export interface ServiceApi {
  me(): Promise<ServiceIdentity>;
  teams(): Promise<readonly Row[]>;
  accounts(): Promise<readonly Row[]>;
  dashboard(): Promise<Dashboard>;
  listCustomers(query: ServiceQuery): Promise<Envelope<readonly Customer[]>>;
  getCustomer(id: number): Promise<Record<string, unknown>>;
  listDevices(query: ServiceQuery): Promise<Envelope<readonly Device[]>>;
  getDevice(id: number): Promise<Record<string, unknown>>;
  listTickets(query: ServiceQuery): Promise<Envelope<readonly Ticket[]>>;
  getTicket(id: number): Promise<Record<string, unknown>>;
  createTicket(
    values: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  updateTicket(
    id: number,
    values: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  ticketAction(
    id: number,
    body: {
      action: string;
      payload?: Record<string, unknown>;
      idempotencyKey?: string;
    },
  ): Promise<Record<string, unknown>>;
  shareTicket(id: number, body: Record<string, unknown>): Promise<void>;
  unshareTicket(id: number, userId: string): Promise<void>;
  listKnowledge(
    query: ServiceQuery,
  ): Promise<Envelope<readonly KnowledgeArticle[]>>;
  getKnowledge(id: number): Promise<Record<string, unknown>>;
  createKnowledge(values: Record<string, unknown>): Promise<{ id: number }>;
  updateKnowledge(id: number, values: Record<string, unknown>): Promise<void>;
  publishKnowledge(id: number, publish: boolean): Promise<void>;
  listInspections(
    query: ServiceQuery,
  ): Promise<Envelope<readonly InspectionTask[]>>;
  listInspectionPlans(): Promise<readonly InspectionPlan[]>;
  runInspections(body: Record<string, unknown>): Promise<Row>;
  updateInspection(id: number, values: Record<string, unknown>): Promise<void>;
  listAttachments(query: ServiceQuery): Promise<readonly AttachmentRecord[]>;
  uploadAttachment(
    file: File,
    links: { ticketId?: number; knowledgeArticleId?: number },
  ): Promise<AttachmentRecord>;
  deleteAttachment(id: string): Promise<void>;
  messages(query: ServiceQuery): Promise<Envelope<readonly InboxItem[]>>;
  messageCount(): Promise<{
    unread: number;
    status: {
      inApp: { available: boolean };
      external: {
        configured: boolean;
        channels: readonly string[];
        reason?: string;
      };
    };
  }>;
  messageAction(body: Record<string, unknown>): Promise<void>;
  deliveries(query: ServiceQuery): Promise<Envelope<readonly DeliveryRecord[]>>;
  retryDelivery(id: number): Promise<DeliveryRecord>;
  assistantStatus(): Promise<AssistantStatus>;
  assistantAsk(question: string, ticketId?: number): Promise<AssistantAnswer>;
  assistantConfirm(
    proposal: AssistantProposal,
  ): Promise<Record<string, unknown>>;
  listIntegrationEvents(limit?: number): Promise<readonly Row[]>;
  ingestEvent(body: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** The URL of a permission-gated attachment, resolved for the deployment base path. */
export function attachmentUrl(id: string): string {
  return resolveAppUrl(`/api/service/attachments/${id}`);
}

/**
 * Adapts a stored attachment to the file registry's read-only record, so the
 * in-app preview can render an image, a PDF or an Office document without the
 * file plugin's public content route. The URL points at this application's own
 * authenticated endpoint, which re-checks the caller's permission.
 */
export function toFileRecords(
  items: readonly AttachmentRecord[],
): FileRecord[] {
  return items.map((item) => ({
    id: item.id,
    disk: item.disk,
    key: item.key,
    filename: item.filename,
    ext: item.ext,
    mimeType: item.mimeType,
    size: item.size,
    createdAt: asText(item.createdAt),
    updatedAt: asText(item.updatedAt),
    contentUrl: attachmentUrl(item.id),
  }));
}

function createServiceApi(client: ApiClient): ServiceApi {
  const get = <T>(path: string, query?: ServiceQuery) =>
    client.request<Envelope<T>>({ path, query });
  const post = <T>(path: string, json?: unknown) =>
    client.request<Envelope<T>>({ path, method: 'POST', json });
  const patch = <T>(path: string, json?: unknown) =>
    client.request<Envelope<T>>({ path, method: 'PATCH', json });
  const remove = <T>(path: string) =>
    client.request<Envelope<T>>({ path, method: 'DELETE' });

  return {
    me: () => get<ServiceIdentity>('/service/me').then((r) => r.data),
    teams: () => get<readonly Row[]>('/service/teams').then((r) => r.data),
    accounts: () =>
      get<readonly Row[]>('/service/accounts').then((r) => r.data),
    dashboard: () => get<Dashboard>('/service/dashboard').then((r) => r.data),
    listCustomers: (query) =>
      get<readonly Customer[]>('/service/customers', query),
    getCustomer: (id) =>
      get<Record<string, unknown>>(`/service/customers/${id}`).then(
        (r) => r.data,
      ),
    listDevices: (query) => get<readonly Device[]>('/service/devices', query),
    getDevice: (id) =>
      get<Record<string, unknown>>(`/service/devices/${id}`).then(
        (r) => r.data,
      ),
    listTickets: (query) => get<readonly Ticket[]>('/service/tickets', query),
    getTicket: (id) =>
      get<Record<string, unknown>>(`/service/tickets/${id}`).then(
        (r) => r.data,
      ),
    createTicket: (values) =>
      post<Record<string, unknown>>('/service/tickets', { values }).then(
        (r) => r.data,
      ),
    updateTicket: (id, values) =>
      patch<Record<string, unknown>>(`/service/tickets/${id}`, { values }).then(
        (r) => r.data,
      ),
    ticketAction: (id, body) =>
      post<Record<string, unknown>>(
        `/service/tickets/${id}/actions`,
        body,
      ).then((r) => r.data),
    shareTicket: (id, body) =>
      post<{ ok: boolean }>(`/service/tickets/${id}/shares`, body).then(
        () => undefined,
      ),
    unshareTicket: (id, userId) =>
      remove<{ ok: boolean }>(`/service/tickets/${id}/shares/${userId}`).then(
        () => undefined,
      ),
    listKnowledge: (query) =>
      get<readonly KnowledgeArticle[]>('/service/knowledge', query),
    getKnowledge: (id) =>
      get<Record<string, unknown>>(`/service/knowledge/${id}`).then(
        (r) => r.data,
      ),
    createKnowledge: (values) =>
      post<{ id: number }>('/service/knowledge', { values }).then(
        (r) => r.data,
      ),
    updateKnowledge: (id, values) =>
      patch<{ ok: boolean }>(`/service/knowledge/${id}`, { values }).then(
        () => undefined,
      ),
    publishKnowledge: (id, publish) =>
      post<{ ok: boolean }>(`/service/knowledge/${id}/publish`, {
        publish,
      }).then(() => undefined),
    listInspections: (query) =>
      get<readonly InspectionTask[]>('/service/inspections', query),
    listInspectionPlans: () =>
      get<readonly InspectionPlan[]>('/service/inspections/plans').then(
        (r) => r.data,
      ),
    runInspections: (body) =>
      post<Row>('/service/inspections/run', body).then((r) => r.data),
    updateInspection: (id, values) =>
      patch<{ ok: boolean }>(`/service/inspections/${id}`, { values }).then(
        () => undefined,
      ),
    listAttachments: (query) =>
      get<readonly AttachmentRecord[]>('/service/attachments', query).then(
        (r) => r.data,
      ),
    uploadAttachment: async (file, links) => {
      const form = new FormData();
      form.set('file', file);
      if (links.ticketId !== undefined)
        form.set('ticketId', String(links.ticketId));
      if (links.knowledgeArticleId !== undefined) {
        form.set('knowledgeArticleId', String(links.knowledgeArticleId));
      }
      return client
        .request<Envelope<AttachmentRecord>>({
          path: '/service/attachments',
          method: 'POST',
          body: form,
        })
        .then((r) => r.data);
    },
    deleteAttachment: (id) =>
      remove<{ ok: boolean }>(`/service/attachments/${id}`).then(
        () => undefined,
      ),
    messages: (query) => get<readonly InboxItem[]>('/service/messages', query),
    messageCount: () =>
      get<{
        unread: number;
        status: {
          inApp: { available: boolean };
          external: {
            configured: boolean;
            channels: readonly string[];
            reason?: string;
          };
        };
      }>('/service/messages/count').then((r) => r.data),
    messageAction: (body) =>
      post<Record<string, unknown>>('/service/messages/actions', body).then(
        () => undefined,
      ),
    deliveries: (query) =>
      get<readonly DeliveryRecord[]>('/service/messages/deliveries', query),
    retryDelivery: (id) =>
      post<DeliveryRecord>(`/service/messages/deliveries/${id}/retry`).then(
        (r) => r.data,
      ),
    assistantStatus: () =>
      get<AssistantStatus>('/service/assistant/status').then((r) => r.data),
    assistantAsk: (question, ticketId) =>
      post<AssistantAnswer>('/service/assistant/ask', {
        question,
        ticketId,
      }).then((r) => r.data),
    assistantConfirm: (proposal) =>
      post<Record<string, unknown>>('/service/assistant/actions/confirm', {
        proposal,
        acknowledge: true,
      }).then((r) => r.data),
    listIntegrationEvents: (limit) =>
      get<readonly Row[]>('/service/integration/events', { limit }).then(
        (r) => r.data,
      ),
    ingestEvent: (body) =>
      post<Record<string, unknown>>('/service/integration/events', body).then(
        (r) => r.data,
      ),
  };
}

/** The API object, stable for as long as the application's client is. */
export function useServiceApi(): ServiceApi {
  const client = useApiClient();
  return useMemo(() => createServiceApi(client), [client]);
}

/** The signed-in user's business identity, shared by pages that vary by permission. */
export function useIdentity(): ResourceResult<ServiceIdentity> {
  const api = useServiceApi();
  return useResource('service:me', () => api.me());
}

export interface ResourceResult<T> {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
}

/**
 * Loads one resource keyed by `key`, aborting the previous request when the key
 * changes. `loading` is derived from the key rather than set synchronously, so
 * an effect never sets state during its own body.
 */
export function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  enabled = true,
): ResourceResult<T> {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{
    key: string;
    status: 'ready' | 'error';
    data?: T;
    error?: unknown;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const controller = new AbortController();
    loadRef
      .current(controller.signal)
      .then((data) => {
        if (active) setState({ key, status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) {
          setState({ key, status: 'error', error });
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, nonce, enabled]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  const current = state?.key === key ? state : null;
  return {
    data: current?.status === 'ready' ? current.data : undefined,
    error: current?.status === 'error' ? current.error : undefined,
    loading:
      enabled && current?.status !== 'ready' && current?.status !== 'error',
    reload,
  };
}

/** A short, translated-neutral description of a failed request. */
export function describeError(error: unknown): string {
  if (error instanceof ApiClientError) {
    const payload = error.payload as
      { message?: string; code?: string } | undefined;
    return payload?.message ?? `${error.status} ${error.code ?? error.message}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export { ApiClientError };
