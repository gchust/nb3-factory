import type { ApiClient } from '@nocobase/app-client';

import type {
  AssistantAnswer,
  AssistantConversation,
  AssistantDetail,
  AutomationRun,
  Bootstrap,
  Customer,
  CustomerDetail,
  DashboardSummary,
  Device,
  InspectionList,
  InspectionPlan,
  JobRun,
  KnowledgeArticle,
  KnowledgeDetail,
  MemberCandidate,
  Paged,
  ServiceCaller,
  ServiceMember,
  Ticket,
  TicketDetail,
} from './types.js';

/**
 * Reads the human message out of a failed service response. The routes answer
 * with the NocoBase `{ errors: [{ message }] }` envelope, but the shared HTTP
 * client only understands `message` / `error.message`, so without this every
 * business-rule failure surfaces as the generic "API request failed (409)".
 */
export function serviceErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const payload = (error as { payload?: unknown }).payload;
    if (payload && typeof payload === 'object') {
      const record = payload as {
        errors?: unknown;
        error?: unknown;
        message?: unknown;
      };
      if (Array.isArray(record.errors)) {
        for (const entry of record.errors) {
          if (
            entry &&
            typeof entry === 'object' &&
            typeof (entry as { message?: unknown }).message === 'string' &&
            (entry as { message: string }).message
          )
            return (entry as { message: string }).message;
        }
      }
      if (
        record.error &&
        typeof record.error === 'object' &&
        typeof (record.error as { message?: unknown }).message === 'string'
      )
        return (record.error as { message: string }).message;
      if (typeof record.message === 'string' && record.message)
        return record.message;
    }
    if (error instanceof Error && error.message) return error.message;
  }
  return String(error);
}

/**
 * Thin typed wrappers over the application's custom `/api/service/*` routes.
 * `api.request` already unwraps nothing, so each function reads the explicit
 * `{ data }` envelope the route returns. Failures are rethrown with the
 * server's business message so a page never shows a bare status code.
 */
export class ServiceClient {
  constructor(private readonly api: ApiClient) {}

  private async request<T>(
    options: Parameters<ApiClient['request']>[0],
  ): Promise<T> {
    try {
      const response = await this.api.request<{ data: T }>(options);
      return response.data;
    } catch (error) {
      throw new Error(serviceErrorMessage(error), { cause: error });
    }
  }

  private async get<T>(
    path: string,
    query?: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>({ path, query: query as never });
  }

  private async post<T>(
    path: string,
    json?: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>({
      path,
      method: 'POST',
      ...(json === undefined ? {} : { json }),
    });
  }

  bootstrap() {
    return this.get<Bootstrap>('service/bootstrap');
  }

  dashboard() {
    return this.get<DashboardSummary>('service/dashboard');
  }

  // Tickets -----------------------------------------------------------------
  listTickets(filters: {
    status?: string;
    region?: string;
    search?: string;
    assigneeId?: string;
    page?: number;
    pageSize?: number;
  }) {
    return this.get<Paged<Ticket>>('service/tickets', filters);
  }

  ticket(id: number | string) {
    return this.get<TicketDetail>(`service/tickets/${id}`);
  }

  createTicket(input: {
    customerId: number;
    deviceId: number;
    title: string;
    description?: string;
    priority?: string;
    confidential?: boolean;
    submit?: boolean;
  }) {
    return this.post<Ticket>('service/tickets', input);
  }

  ticketAction(
    id: number | string,
    action: string,
    payload: Record<string, unknown> = {},
  ) {
    return this.post<Ticket & { idempotent?: boolean }>(
      `service/tickets/${id}/actions/${action}`,
      payload,
    );
  }

  shareTicket(id: number | string, userId: string, active = true) {
    return this.post(`service/tickets/${id}/shares`, { userId, active });
  }

  attachTicketFiles(id: number | string, fileIds: readonly string[]) {
    return this.post(`service/tickets/${id}/files`, { fileIds });
  }

  // Automatic acceptance ----------------------------------------------------
  listAutomationRuns(filters: { page?: number; pageSize?: number } = {}) {
    return this.get<Paged<AutomationRun>>('service/automation-runs', filters);
  }

  ticketAutomationRuns(ticketId: number | string) {
    return this.get<Paged<AutomationRun>>(
      `service/tickets/${ticketId}/automation-runs`,
    );
  }

  retryAutomation(ticketId: number | string) {
    return this.post<AutomationRun>(
      `service/tickets/${ticketId}/automation-runs/retry`,
    );
  }

  // Customers ---------------------------------------------------------------
  listCustomers(filters: {
    search?: string;
    region?: string;
    page?: number;
    pageSize?: number;
  }) {
    return this.get<Paged<Customer>>('service/customers', filters);
  }

  customer(id: number | string) {
    return this.get<CustomerDetail>(`service/customers/${id}`);
  }

  saveCustomer(input: Record<string, unknown>) {
    return this.post<Customer>('service/customers', input);
  }

  // Devices -----------------------------------------------------------------
  listDevices(filters: {
    search?: string;
    region?: string;
    customerId?: number;
    page?: number;
    pageSize?: number;
  }) {
    return this.get<Paged<Device>>('service/devices', filters);
  }

  saveDevice(input: Record<string, unknown>) {
    return this.post<Device>('service/devices', input);
  }

  // Knowledge ---------------------------------------------------------------
  listKnowledge(filters: {
    search?: string;
    category?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    return this.get<Paged<KnowledgeArticle>>('service/knowledge', filters);
  }

  knowledge(id: number | string) {
    return this.get<KnowledgeDetail>(`service/knowledge/${id}`);
  }

  saveKnowledge(input: Record<string, unknown>) {
    return this.post<KnowledgeArticle>('service/knowledge', input);
  }

  attachKnowledgeFiles(id: number | string, fileIds: readonly string[]) {
    return this.post(`service/knowledge/${id}/files`, { fileIds });
  }

  // Inspections -------------------------------------------------------------
  listInspections(filters: {
    date?: string;
    status?: string;
    region?: string;
  }) {
    return this.get<InspectionList>('service/inspections', filters);
  }

  generateInspections(input: { planId?: number; date?: string }) {
    return this.post('service/inspections/generate', input);
  }

  inspectionPlans() {
    return this.get<readonly InspectionPlan[]>('service/inspections/plans');
  }

  setInspectionPlanEnabled(id: number | string, enabled: boolean) {
    return this.post<InspectionPlan>(`service/inspections/plans/${id}`, {
      enabled,
    });
  }

  runInspectionPlan(id: number | string, date?: string) {
    return this.post<{ plan: InspectionPlan; result: unknown }>(
      `service/inspections/plans/${id}/run`,
      { date },
    );
  }

  inspectionRuns(filters: { page?: number; pageSize?: number } = {}) {
    return this.get<Paged<JobRun>>('service/inspections/runs', filters);
  }

  completeInspection(id: number | string, note?: string) {
    return this.post(`service/inspections/${id}/complete`, { note });
  }

  // Assistant ---------------------------------------------------------------
  listConversations() {
    return this.get<readonly AssistantConversation[]>(
      'service/assistant/conversations',
    );
  }

  createConversation(title?: string) {
    return this.post<AssistantConversation>('service/assistant/conversations', {
      title,
    });
  }

  conversation(id: number | string) {
    return this.get<AssistantDetail>(`service/assistant/conversations/${id}`);
  }

  ask(id: number | string, question: string) {
    return this.post<AssistantAnswer>(
      `service/assistant/conversations/${id}/messages`,
      { question },
    );
  }

  // Members -----------------------------------------------------------------
  listMembers() {
    return this.get<readonly ServiceMember[]>('service/members');
  }

  listMemberCandidates() {
    return this.get<readonly MemberCandidate[]>('service/members/candidates');
  }

  saveMember(input: {
    id?: number;
    userId: string;
    region: string;
    teamName?: string;
  }) {
    return this.post<ServiceMember>('service/members', input);
  }
}

export function can(
  caller: ServiceCaller | undefined,
  capability: string,
): boolean {
  return caller?.capabilities[capability] === true;
}
