import { useApiClient } from '@nocobase/app-client';
import { useMemo } from 'react';

import type {
  AssistantAnswer,
  AssistantConversation,
  DashboardSummary,
  ServiceAttachment,
  ServiceCustomer,
  ServiceDevice,
  ServiceEngineer,
  ServiceInspection,
  ServiceKnowledgeArticle,
  ServiceManual,
  ServiceSchedule,
  ServiceScheduleOccurrence,
  ServiceScheduleRun,
  ServiceTeamMember,
  ServiceWorkOrder,
  ServiceSessionContext,
  WorkOrderPriority,
} from './types.js';

/** The `page` resource ids the installation seeds grants against. */
export const SERVICE_PAGE_IDS = {
  dashboard: 'service.dashboard',
  customers: 'service.customers',
  devices: 'service.devices',
  workOrders: 'service.workOrders',
  inspections: 'service.inspections',
  knowledge: 'service.knowledge',
  manuals: 'service.manuals',
  integration: 'service.integration',
  assistant: 'service.assistant',
} as const;

export interface WorkOrderQuery {
  readonly status?: string;
  readonly priority?: string;
  readonly keyword?: string;
  readonly assigneeId?: string;
  readonly group?: string;
  readonly overdue?: boolean;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface WorkOrderList {
  readonly rows: readonly ServiceWorkOrder[];
  readonly total: number;
}

export interface CustomerInput {
  readonly id?: number;
  readonly name: string;
  readonly contactName?: string;
  readonly contactPhone?: string;
  readonly contactEmail?: string;
  readonly address?: string;
  readonly note?: string;
}

export interface DeviceInput {
  readonly id?: number;
  readonly serialNumber: string;
  readonly name: string;
  readonly customerId?: number | null;
  readonly engineerId?: string | null;
  readonly enabled?: boolean;
  readonly installedAt?: string | null;
  readonly nextInspectionDate?: string | null;
  readonly model?: string;
  readonly location?: string;
  readonly note?: string;
}

export interface KnowledgeInput {
  readonly id?: number;
  readonly title: string;
  readonly summary?: string;
  readonly content: string;
  readonly tags?: string;
  readonly status?: 'draft' | 'published';
}

export interface ManualInput {
  readonly id?: number;
  readonly title: string;
  readonly version: string;
  readonly deviceModel?: string;
  readonly content: string;
  readonly status?: 'draft' | 'published';
}

export interface TeamMemberInput {
  readonly id?: number;
  readonly userId: string;
  readonly groupName: 'group_a' | 'group_b';
  readonly displayName?: string;
}

export interface WorkOrderInput {
  readonly title: string;
  readonly description?: string;
  readonly customerId?: number;
  readonly deviceId?: number;
  readonly priority?: WorkOrderPriority;
  readonly confidential?: boolean;
  readonly assigneeId?: string;
  readonly dueAt?: string;
  readonly idempotencyKey?: string;
  readonly externalEventId?: string;
}

export interface ServiceApi {
  readonly context: () => Promise<ServiceSessionContext>;
  readonly dashboard: () => Promise<DashboardSummary>;
  readonly listWorkOrders: (query: WorkOrderQuery) => Promise<WorkOrderList>;
  readonly createWorkOrder: (
    input: WorkOrderInput,
  ) => Promise<ServiceWorkOrder>;
  readonly getWorkOrder: (id: string | number) => Promise<ServiceWorkOrder>;
  readonly transition: (
    id: string | number,
    action: string,
    input?: { resolution?: string; note?: string },
  ) => Promise<ServiceWorkOrder>;
  readonly comment: (
    id: string | number,
    content: string,
  ) => Promise<{ ok: boolean }>;
  readonly share: (id: string | number, engineerId: string) => Promise<unknown>;
  readonly unshare: (
    id: string | number,
    engineerId: string,
  ) => Promise<{ ok: boolean }>;
  readonly uploadAttachment: (
    id: string | number,
    file: File,
    category: 'photo' | 'report',
  ) => Promise<ServiceAttachment>;
  readonly deleteAttachment: (
    id: string | number,
    attachmentId: string | number,
  ) => Promise<{ ok: boolean }>;
  readonly listCustomers: () => Promise<ServiceCustomer[]>;
  readonly saveCustomer: (input: CustomerInput) => Promise<ServiceCustomer>;
  readonly deleteCustomer: (id: number) => Promise<{ ok: boolean }>;
  readonly listDevices: () => Promise<ServiceDevice[]>;
  readonly saveDevice: (input: DeviceInput) => Promise<ServiceDevice>;
  readonly deleteDevice: (id: number) => Promise<{ ok: boolean }>;
  readonly listEngineers: () => Promise<ServiceEngineer[]>;
  readonly listTeamMembers: () => Promise<ServiceTeamMember[]>;
  readonly saveTeamMember: (
    input: TeamMemberInput,
  ) => Promise<ServiceTeamMember>;
  readonly deleteTeamMember: (id: number) => Promise<{ ok: boolean }>;
  readonly listKnowledge: () => Promise<ServiceKnowledgeArticle[]>;
  readonly saveKnowledge: (
    input: KnowledgeInput,
  ) => Promise<ServiceKnowledgeArticle>;
  readonly deleteKnowledge: (id: number) => Promise<{ ok: boolean }>;
  readonly listManuals: () => Promise<ServiceManual[]>;
  readonly saveManual: (input: ManualInput) => Promise<ServiceManual>;
  readonly deleteManual: (id: number) => Promise<{ ok: boolean }>;
  readonly listInspections: () => Promise<ServiceInspection[]>;
  readonly completeInspection: (
    id: string | number,
    result: string,
  ) => Promise<ServiceInspection>;
  readonly generateInspections: (
    date?: string,
  ) => Promise<ServiceScheduleRun & { readonly date: string }>;
  readonly listSchedules: () => Promise<ServiceSchedule[]>;
  readonly listScheduleOccurrences: (
    id: string,
  ) => Promise<ServiceScheduleOccurrence[]>;
  readonly runSchedule: (key: string) => Promise<ServiceScheduleRun>;
  readonly askAssistant: (
    question: string,
    workOrderId?: string,
  ) => Promise<AssistantAnswer>;
  readonly confirmAssistant: (
    input: WorkOrderInput,
  ) => Promise<ServiceWorkOrder>;
  readonly listConversations: () => Promise<AssistantConversation[]>;
  readonly saveConversation: (
    conversationId: string | number | undefined,
    title: string,
    messages: unknown,
  ) => Promise<AssistantConversation>;
  readonly submitDeviceReport: (
    input: WorkOrderInput,
  ) => Promise<{ id: number; orderNo: string }>;
}

type Client = ReturnType<typeof useApiClient>;

async function unwrap<T>(request: Promise<unknown>): Promise<T> {
  const payload = (await request) as { data?: T };
  return payload?.data ?? (payload as T);
}

/**
 * Typed access to this application's own `/api/service/*` routes. The client
 * sends same-origin cookies, so authentication and the server's CSRF-origin
 * check both pass without extra headers.
 */
export function createServiceApi(client: Client): ServiceApi {
  const get = <T>(path: string, query?: Record<string, unknown>) =>
    unwrap<T>(
      client.request<{ data: T }>({
        path,
        method: 'GET',
        query: query as never,
      }),
    );
  const send = <T>(
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    json?: unknown,
  ) =>
    unwrap<T>(
      client.request<{ data: T }>({ path, method, json: json as never }),
    );

  return {
    context: () => get<ServiceSessionContext>('/service/context'),
    dashboard: () => get<DashboardSummary>('/service/dashboard'),
    listWorkOrders: async (query) => {
      const payload = (await client.request<{
        data: ServiceWorkOrder[];
        meta: { total: number };
      }>({
        path: '/service/work-orders',
        method: 'GET',
        query: {
          status: query.status,
          priority: query.priority,
          keyword: query.keyword,
          assigneeId: query.assigneeId,
          group: query.group,
          overdue: query.overdue ? 'true' : undefined,
          page: query.page,
          pageSize: query.pageSize,
        },
      })) as { data?: ServiceWorkOrder[]; meta?: { total?: number } };
      return {
        rows: payload.data ?? [],
        total: payload.meta?.total ?? 0,
      };
    },
    createWorkOrder: (input) =>
      send<ServiceWorkOrder>('/service/work-orders', 'POST', input),
    getWorkOrder: (id) => get<ServiceWorkOrder>(`/service/work-orders/${id}`),
    transition: (id, action, input) =>
      send<ServiceWorkOrder>(`/service/work-orders/${id}/transition`, 'POST', {
        action,
        ...input,
      }),
    comment: (id, content) =>
      send<{ ok: boolean }>(`/service/work-orders/${id}/comments`, 'POST', {
        content,
      }),
    share: (id, engineerId) =>
      send<unknown>(`/service/work-orders/${id}/share`, 'POST', { engineerId }),
    unshare: (id, engineerId) =>
      send<{ ok: boolean }>(
        `/service/work-orders/${id}/share/${engineerId}`,
        'DELETE',
      ),
    uploadAttachment: async (id, file, category) => {
      const form = new FormData();
      form.append('file', file);
      form.append('category', category);
      return unwrap<ServiceAttachment>(
        client.request<{ data: ServiceAttachment }>({
          path: `/service/work-orders/${id}/attachments`,
          method: 'POST',
          body: form,
        }),
      );
    },
    deleteAttachment: (id, attachmentId) =>
      send<{ ok: boolean }>(
        `/service/work-orders/${id}/attachments/${attachmentId}`,
        'DELETE',
      ),
    listCustomers: () => get<ServiceCustomer[]>('/service/customers'),
    saveCustomer: (input) =>
      input.id
        ? send<ServiceCustomer>(`/service/customers/${input.id}`, 'PUT', input)
        : send<ServiceCustomer>('/service/customers', 'POST', input),
    deleteCustomer: (id) =>
      send<{ ok: boolean }>(`/service/customers/${id}`, 'DELETE'),
    listDevices: () => get<ServiceDevice[]>('/service/devices'),
    saveDevice: (input) =>
      input.id
        ? send<ServiceDevice>(`/service/devices/${input.id}`, 'PUT', input)
        : send<ServiceDevice>('/service/devices', 'POST', input),
    deleteDevice: (id) =>
      send<{ ok: boolean }>(`/service/devices/${id}`, 'DELETE'),
    listEngineers: () => get<ServiceEngineer[]>('/service/engineers'),
    listTeamMembers: () => get<ServiceTeamMember[]>('/service/team-members'),
    saveTeamMember: (input) =>
      input.id
        ? send<ServiceTeamMember>(
            `/service/team-members/${input.id}`,
            'PUT',
            input,
          )
        : send<ServiceTeamMember>('/service/team-members', 'POST', input),
    deleteTeamMember: (id) =>
      send<{ ok: boolean }>(`/service/team-members/${id}`, 'DELETE'),
    listKnowledge: () => get<ServiceKnowledgeArticle[]>('/service/knowledge'),
    saveKnowledge: (input) =>
      input.id
        ? send<ServiceKnowledgeArticle>(
            `/service/knowledge/${input.id}`,
            'PUT',
            input,
          )
        : send<ServiceKnowledgeArticle>('/service/knowledge', 'POST', input),
    deleteKnowledge: (id) =>
      send<{ ok: boolean }>(`/service/knowledge/${id}`, 'DELETE'),
    listManuals: () => get<ServiceManual[]>('/service/manuals'),
    saveManual: (input) =>
      input.id
        ? send<ServiceManual>(`/service/manuals/${input.id}`, 'PUT', input)
        : send<ServiceManual>('/service/manuals', 'POST', input),
    deleteManual: (id) =>
      send<{ ok: boolean }>(`/service/manuals/${id}`, 'DELETE'),
    listInspections: () => get<ServiceInspection[]>('/service/inspections'),
    completeInspection: (id, result) =>
      send<ServiceInspection>(`/service/inspections/${id}/complete`, 'POST', {
        result,
      }),
    generateInspections: (date) =>
      send<ServiceScheduleRun & { date: string }>(
        '/service/inspections/generate',
        'POST',
        { date },
      ),
    listSchedules: () => get<ServiceSchedule[]>('/schedules'),
    listScheduleOccurrences: (id) =>
      get<ServiceScheduleOccurrence[]>(`/schedules/${id}/occurrences`),
    runSchedule: (key) =>
      send<ServiceScheduleRun>(`/service/schedules/${key}/run`, 'POST', {}),
    askAssistant: (question, workOrderId) =>
      send<AssistantAnswer>('/service/assistant/query', 'POST', {
        question,
        workOrderId,
      }),
    confirmAssistant: (input) =>
      send<ServiceWorkOrder>('/service/assistant/confirm', 'POST', input),
    listConversations: () =>
      get<AssistantConversation[]>('/service/assistant/conversations'),
    saveConversation: (conversationId, title, messages) =>
      send<AssistantConversation>('/service/assistant/conversations', 'POST', {
        conversationId,
        title,
        messages,
      }),
    submitDeviceReport: (input) =>
      send<{ id: number; orderNo: string }>(
        '/service/device-platform/reports',
        'POST',
        input,
      ),
  };
}

export function useServiceApi(): ServiceApi {
  const client = useApiClient();
  return useMemo(() => createServiceApi(client), [client]);
}
