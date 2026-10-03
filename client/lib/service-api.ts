import {
  ApiClientError,
  useApiClient,
  type ApiClient,
} from '@nocobase/app-client';
import { useMemo } from 'react';

/**
 * The application's own service API, under `/api/service`.
 *
 * Every request goes through the application's `ApiClient`, so it carries the
 * session cookie and the current language, and none of it can be sent with a
 * different base URL by forgetting an argument.
 */
export interface ServiceMe {
  userId: string;
  profileId: number | null;
  role: string | null;
  displayName: string | null;
  can: {
    createOrder: boolean;
    processOrder: boolean;
    superviseOrder: boolean;
    manageKnowledge: boolean;
    manageLedger: boolean;
    manageInspections: boolean;
  };
}

export interface OrderAssignee {
  id: string | null;
  name: string | null;
  profileId: number | null;
}

export interface OrderView {
  id: number;
  orderNo: string;
  title: string;
  problemDescription?: string | null;
  status: string;
  priority: string;
  source: string;
  confidential: boolean;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: OrderAssignee;
  customer: {
    id: number;
    name: string;
    contactName: string | null;
    contactPhone: string | null;
  } | null;
  device: {
    id: number;
    deviceNo: string;
    name: string;
    status: string;
    model: string | null;
    location: string | null;
    nextInspectionDate: string | null;
  } | null;
  acceptedAt?: string | null;
  acceptanceNote?: string | null;
  startedAt?: string | null;
  submittedAt?: string | null;
  closedAt?: string | null;
  resolution?: string | null;
  returnReason?: string | null;
  returnCount?: number;
  attachmentCount?: number;
  can: {
    view: boolean;
    viewSummary: boolean;
    process: boolean;
    supervise: boolean;
    attach: boolean;
  };
}

export interface OrderEvent {
  id: number;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  operatorId: string | null;
  operatorRole: string | null;
  idempotencyKey: string | null;
  createdAt: string | null;
}

export interface OrderShare {
  id: number;
  orderId: number;
  sharedWithId: string;
  sharedWithName: string | null;
  sharedById: string | null;
  ruleKey: string;
  createdAt: string;
}

export interface AttachmentView {
  id: string;
  linkId: number;
  filename: string;
  ext: string;
  mimeType: string | null;
  size: number;
  kind: string;
  createdAt: string | null;
  contentUrl: string;
  downloadUrl: string;
}

export interface DashboardSummary {
  orders: {
    total: number;
    byStatus: Record<string, number>;
    urgent: number;
    overdue: number;
    awaitingMyAction: number;
  };
  inspections: {
    total: number;
    pending: number;
    overdue: number;
  };
  recentOrders: OrderView[];
  groups: {
    id: number;
    code: string;
    name: string;
    engineers: number;
    openOrders: number;
  }[];
  myDeadlines: {
    id: number;
    deviceId: number;
    planDate: string;
    status: string;
  }[];
}

export interface InspectionView {
  id: number;
  deviceId: number;
  planDate: string;
  status: string;
  result: string | null;
  completedAt: string | null;
  device: {
    id: number;
    deviceNo: string;
    name: string;
    customerId: number;
    location: string | null;
  } | null;
}

export interface KnowledgeArticleView {
  id: number;
  title: string;
  summary: string | null;
  body?: string | null;
  status: string;
  updatedAt: string | null;
  canEdit: boolean;
}

export interface CustomerView {
  id: number;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  address: string | null;
  note: string | null;
}

export interface DeviceView {
  id: number;
  deviceNo: string;
  name: string;
  model: string | null;
  location: string | null;
  status: string;
  customerId: number;
  engineerProfileId: number | null;
  serviceEngineerId: string | null;
  nextInspectionDate: string | null;
}

export interface EngineerView {
  id: number;
  displayName: string | null;
  username: string;
  role: string;
  groupId: number | null;
  userId: string | null;
}

export interface AssistantCitation {
  kind: 'order' | 'knowledge' | 'manual';
  id: string | number;
  title: string;
  subtitle?: string;
  detail?: string;
  href?: string;
}

export interface AssistantReply {
  question: string;
  answer: string;
  citations: AssistantCitation[];
  draft: string;
  grounded: boolean;
  degraded: boolean;
  reason: string;
  orderId: number | null;
  createdAt: string;
}

export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  payload: AssistantReply | null;
  degraded: boolean;
  orderId: number | null;
  createdAt: string;
}

export interface AssistantStatus {
  employees: {
    username: string;
    nickname: string;
    position: string;
    bio: string;
    enabled: boolean;
    builtIn: boolean;
  }[];
  llmServices: {
    name: string;
    title: string;
    provider: string;
    enabled: boolean;
  }[];
  knowledgeBases: {
    key: string;
    name: string;
    enabled: boolean;
    documentCount: number;
    llmService: string;
    embeddingModel: string;
  }[];
  documents: {
    id: number;
    knowledgeBaseKey: string;
    title: string;
    filename: string;
    indexStatus: string;
    segmentCount: number;
    errorMessage: string;
  }[];
  modelConfigured: boolean;
}

export class ServiceApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceApiError';
  }
}

/** One HTTP call, unwrapping `{data}` and turning an error body into a `ServiceApiError`. */
export async function serviceRequest<T>(
  api: ApiClient,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    query?: Record<string, string | number | undefined>;
    json?: unknown;
    body?: BodyInit;
  } = {},
): Promise<T> {
  try {
    const shared = {
      path: `/service${path}`,
      method: options.method ?? ('GET' as const),
      query: options.query,
    };
    const response =
      options.body !== undefined
        ? await api.request<{ data?: T }>({ ...shared, body: options.body })
        : await api.request<{ data?: T }>({
            ...shared,
            ...(options.json !== undefined ? { json: options.json } : {}),
          });
    return response.data as T;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw new ServiceApiError(
        error.status,
        error.code ?? 'REQUEST_FAILED',
        error.message,
      );
    }
    throw error;
  }
}

export interface ServiceApi {
  me(): Promise<ServiceMe>;
  dashboard(): Promise<DashboardSummary>;
  orders(query?: {
    search?: string;
    status?: string;
    priority?: string;
    assigneeId?: string;
  }): Promise<OrderView[]>;
  order(id: number): Promise<OrderView>;
  orderEvents(id: number): Promise<OrderEvent[]>;
  createOrder(input: Record<string, unknown>): Promise<OrderView>;
  transition(
    id: number,
    action: string,
    comment?: string,
  ): Promise<{ order: OrderView }>;
  attachments(orderId: number): Promise<AttachmentView[]>;
  uploadAttachment(
    orderId: number,
    file: File,
    kind?: string,
  ): Promise<AttachmentView>;
  removeAttachment(orderId: number, attachmentId: string): Promise<void>;
  shares(orderId: number): Promise<OrderShare[]>;
  shareOrder(orderId: number, engineerId: string): Promise<OrderShare>;
  revokeShare(orderId: number, shareId: number): Promise<void>;
  engineers(): Promise<EngineerView[]>;
  customers(search?: string): Promise<CustomerView[]>;
  createCustomer(input: Record<string, unknown>): Promise<CustomerView>;
  updateCustomer(id: number, input: Record<string, unknown>): Promise<void>;
  devices(search?: string): Promise<DeviceView[]>;
  createDevice(input: Record<string, unknown>): Promise<DeviceView>;
  updateDevice(id: number, input: Record<string, unknown>): Promise<void>;
  inspections(status?: string): Promise<InspectionView[]>;
  completeInspection(id: number, result: string): Promise<void>;
  generateInspections(): Promise<{
    created: number;
    skipped: number;
    reminders: number;
  }>;
  generateReminders(): Promise<{ reminders: number }>;
  assistantStatus(): Promise<AssistantStatus>;
  assistantMessages(orderId?: number): Promise<AssistantMessage[]>;
  askAssistant(question: string, orderId?: number): Promise<AssistantReply>;
  knowledge(search?: string): Promise<KnowledgeArticleView[]>;
  knowledgeArticle(id: number): Promise<KnowledgeArticleView>;
  createKnowledge(input: Record<string, unknown>): Promise<{ id: number }>;
  updateKnowledge(id: number, input: Record<string, unknown>): Promise<void>;
}

/** Builds the service API bound to one `ApiClient`. */
export function createServiceApi(api: ApiClient): ServiceApi {
  const get = <T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ) => serviceRequest<T>(api, path, query ? { query } : {});

  return {
    me: () => get<ServiceMe>('/me'),
    dashboard: () => get<DashboardSummary>('/dashboard'),
    orders: (query) => get<OrderView[]>('/orders', query),
    order: (id) => get<OrderView>(`/orders/${id}`),
    orderEvents: (id) => get<OrderEvent[]>(`/orders/${id}/events`),
    createOrder: (input) =>
      serviceRequest<OrderView>(api, '/orders', {
        method: 'POST',
        json: input,
      }),
    transition: (id, action, comment) =>
      serviceRequest<{ order: OrderView }>(api, `/orders/${id}/${action}`, {
        method: 'POST',
        json: comment === undefined ? {} : { comment },
      }),
    attachments: (orderId) =>
      get<AttachmentView[]>(`/orders/${orderId}/attachments`),
    uploadAttachment: (orderId, file, kind) => {
      const body = new FormData();
      body.set('file', file);
      if (kind) {
        body.set('kind', kind);
      }
      return serviceRequest<AttachmentView>(
        api,
        `/orders/${orderId}/attachments`,
        {
          method: 'POST',
          body,
        },
      );
    },
    removeAttachment: async (orderId, attachmentId) => {
      await serviceRequest<unknown>(
        api,
        `/orders/${orderId}/attachments/${attachmentId}`,
        {
          method: 'DELETE',
        },
      );
    },
    shares: (orderId) => get<OrderShare[]>(`/orders/${orderId}/shares`),
    shareOrder: (orderId, engineerId) =>
      serviceRequest<OrderShare>(api, `/orders/${orderId}/shares`, {
        method: 'POST',
        json: { engineerId },
      }),
    revokeShare: async (orderId, shareId) => {
      await serviceRequest<unknown>(
        api,
        `/orders/${orderId}/shares/${shareId}`,
        {
          method: 'DELETE',
        },
      );
    },
    engineers: () => get<EngineerView[]>('/engineers'),
    assistantStatus: () => get<AssistantStatus>('/assistant/status'),
    assistantMessages: (orderId) =>
      get<AssistantMessage[]>(
        '/assistant/messages',
        orderId === undefined ? undefined : { orderId },
      ),
    askAssistant: (question, orderId) =>
      serviceRequest<AssistantReply>(api, '/assistant/ask', {
        method: 'POST',
        json: orderId === undefined ? { question } : { question, orderId },
      }),
    customers: (search) => get<CustomerView[]>('/customers', { search }),
    createCustomer: (input) =>
      serviceRequest<CustomerView>(api, '/customers', {
        method: 'POST',
        json: input,
      }),
    updateCustomer: async (id, input) => {
      await serviceRequest<unknown>(api, `/customers/${id}`, {
        method: 'PUT',
        json: input,
      });
    },
    devices: (search) => get<DeviceView[]>('/devices', { search }),
    createDevice: (input) =>
      serviceRequest<DeviceView>(api, '/devices', {
        method: 'POST',
        json: input,
      }),
    updateDevice: async (id, input) => {
      await serviceRequest<unknown>(api, `/devices/${id}`, {
        method: 'PUT',
        json: input,
      });
    },
    inspections: (status) => get<InspectionView[]>('/inspections', { status }),
    completeInspection: async (id, result) => {
      await serviceRequest<unknown>(api, `/inspections/${id}/complete`, {
        method: 'POST',
        json: { result },
      });
    },
    generateInspections: () =>
      serviceRequest<{ created: number; skipped: number; reminders: number }>(
        api,
        '/inspections/generate',
        { method: 'POST', json: {} },
      ),
    generateReminders: () =>
      serviceRequest<{ reminders: number }>(api, '/reminders/generate', {
        method: 'POST',
        json: {},
      }),
    knowledge: (search) =>
      get<KnowledgeArticleView[]>('/knowledge', { search }),
    knowledgeArticle: (id) => get<KnowledgeArticleView>(`/knowledge/${id}`),
    createKnowledge: (input) =>
      serviceRequest<{ id: number }>(api, '/knowledge', {
        method: 'POST',
        json: input,
      }),
    updateKnowledge: async (id, input) => {
      await serviceRequest<unknown>(api, `/knowledge/${id}`, {
        method: 'PUT',
        json: input,
      });
    },
  };
}

/** The service API bound to the application's `ApiClient`, stable across renders. */
export function useServiceApi(): ServiceApi {
  const api = useApiClient();
  return useMemo(() => createServiceApi(api), [api]);
}
