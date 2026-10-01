import type { ApiClient } from '@nocobase/app-client';

/** The ticket lifecycle states, in the order a ticket moves through them. */
export const TICKET_STATUSES = [
  'pending_acceptance',
  'pending_processing',
  'processing',
  'pending_confirmation',
  'closed',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['normal', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly contactName?: string | null;
  readonly contactPhone?: string | null;
  readonly address?: string | null;
  readonly note?: string | null;
}

export interface Device {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly model?: string | null;
  readonly serialNo?: string | null;
  readonly customerId: number;
  readonly customerName?: string | null;
  readonly engineerId?: string | null;
  readonly engineerName?: string | null;
  readonly enabled: boolean;
  readonly nextInspectionDate?: string | null;
  readonly lastInspectionDate?: string | null;
}

export interface Engineer {
  readonly id: string;
  readonly name: string;
  readonly username?: string | null;
  readonly email?: string | null;
}

export interface Attachment {
  readonly id: number;
  readonly fileId: string;
  readonly filename: string;
  readonly mimeType?: string | null;
  readonly size?: number | null;
  readonly kind: string;
  readonly uploadedById?: string | null;
  readonly createdAt?: string;
}

export interface ExecutionLog {
  readonly id: number;
  readonly actorId?: string | null;
  readonly action: string;
  readonly detail?: string | null;
  readonly createdAt?: string;
}

export interface TicketShare {
  readonly id: number;
  readonly engineerId: string;
  readonly engineerName?: string | null;
  readonly expiresAt?: string | null;
  readonly expired?: boolean;
  readonly createdAt?: string;
}

export interface Ticket {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly description?: string | null;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly confidential: boolean;
  readonly source: string;
  readonly externalEventNo?: string | null;
  readonly customerId: number;
  readonly customerName?: string | null;
  readonly deviceId?: number | null;
  readonly deviceCode?: string | null;
  readonly deviceName?: string | null;
  readonly assigneeId?: string | null;
  readonly assigneeName?: string | null;
  readonly createdById?: string | null;
  readonly acceptedById?: string | null;
  readonly acceptNote?: string | null;
  readonly processNote?: string | null;
  readonly resultNote?: string | null;
  readonly rejectReason?: string | null;
  readonly confirmationNote?: string | null;
  readonly dueAt?: string | null;
  readonly acceptedAt?: string | null;
  readonly submittedAt?: string | null;
  readonly closedAt?: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly attachments?: Attachment[];
  readonly executionLogs?: ExecutionLog[];
  readonly shares?: TicketShare[];
  /** Set for the read-only observer view: only the summary fields are returned. */
  readonly summaryOnly?: boolean;
}

export interface TicketListResult {
  readonly items: Ticket[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface KnowledgeArticle {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly category?: string | null;
  readonly published: boolean;
  readonly authorId?: string | null;
  readonly updatedAt?: string;
}

export interface Manual {
  readonly slug: string;
  readonly title: string;
  readonly deviceModel?: string | null;
  readonly summary?: string | null;
  readonly content: string;
}

export interface Inspection {
  readonly id: number;
  readonly deviceId: number;
  readonly deviceCode?: string | null;
  readonly deviceName?: string | null;
  readonly customerName?: string | null;
  readonly inspectionDate: string;
  readonly engineerId?: string | null;
  readonly engineerName?: string | null;
  readonly status: string;
  readonly resultNote?: string | null;
  readonly ticketId?: number | null;
  readonly reminderSent: boolean;
}

export interface DashboardCounts {
  readonly total: number;
  readonly pendingAcceptance: number;
  readonly pendingProcessing: number;
  readonly processing: number;
  readonly pendingConfirmation: number;
  readonly closed: number;
  readonly urgent: number;
  readonly overdue: number;
  readonly confidential: number;
}

export interface DashboardData {
  readonly scope: 'all' | 'own';
  readonly counts: DashboardCounts;
  readonly byStatus: { readonly status: string; readonly count: number }[];
  readonly devicesDueInspection: number;
  readonly pendingInspections: number;
  readonly knowledgePublished: number;
  readonly knowledgeDrafts: number;
}

export interface AssistantCitation {
  readonly sourceType: 'ticket' | 'knowledge' | 'manual';
  readonly reference: string;
  readonly title: string;
  readonly excerpt: string;
}

export interface AssistantAnswer {
  readonly question: string;
  readonly answer: string;
  readonly draft: string;
  readonly citations: AssistantCitation[];
  readonly mode: string;
  readonly modelAvailable: boolean;
}

/** One persisted assistant exchange restored on the next page load. */
export interface AssistantMessage {
  readonly id: number;
  readonly ticketId?: number | null;
  readonly question: string;
  readonly answer: string;
  readonly draft: string;
  readonly citations: AssistantCitation[];
  readonly modelAvailable: boolean;
  readonly createdAt?: string | null;
}

export interface CustomerInput {
  readonly name: string;
  readonly contactName?: string | null;
  readonly contactPhone?: string | null;
  readonly address?: string | null;
  readonly note?: string | null;
}

export interface DeviceInput {
  readonly code: string;
  readonly name: string;
  readonly model?: string | null;
  readonly serialNo?: string | null;
  readonly customerId: number;
  readonly engineerId?: string | null;
  readonly enabled?: boolean;
  readonly nextInspectionDate?: string | null;
}

export interface TicketInput {
  readonly title: string;
  readonly description?: string | null;
  readonly customerId: number;
  readonly deviceId?: number | null;
  readonly priority?: TicketPriority;
  readonly confidential?: boolean;
  readonly assigneeId?: string | null;
  readonly dueAt?: string | null;
}

// ------------------------------------------------------------- read helpers

export async function fetchCustomers(
  api: ApiClient,
  keyword?: string,
): Promise<Customer[]> {
  const { data } = await api.request<{ data: Customer[] }>({
    path: 'service/customers',
    query: keyword ? { keyword } : undefined,
  });
  return data;
}

export async function fetchDevices(
  api: ApiClient,
  query?: { customerId?: number; enabled?: boolean },
): Promise<Device[]> {
  const { data } = await api.request<{ data: Device[] }>({
    path: 'service/devices',
    query,
  });
  return data;
}

export async function fetchEngineers(api: ApiClient): Promise<Engineer[]> {
  const { data } = await api.request<{ data: Engineer[] }>({
    path: 'service/engineers',
  });
  return data;
}

export async function fetchTickets(
  api: ApiClient,
  query: {
    status?: string;
    priority?: string;
    customerId?: number;
    keyword?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<TicketListResult> {
  return api.request<TicketListResult>({ path: 'service/tickets', query });
}

export async function fetchTicket(api: ApiClient, id: number): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }>({
    path: `service/tickets/${id}`,
  });
  return data;
}

export async function fetchArticles(
  api: ApiClient,
): Promise<KnowledgeArticle[]> {
  const { data } = await api.request<{ data: KnowledgeArticle[] }>({
    path: 'service/knowledge/articles',
  });
  return data;
}

export async function fetchManuals(api: ApiClient): Promise<Manual[]> {
  const { data } = await api.request<{ data: Manual[] }>({
    path: 'service/knowledge/manuals',
  });
  return data;
}

export async function fetchInspectionList(
  api: ApiClient,
  query?: { date?: string },
): Promise<Inspection[]> {
  const { data } = await api.request<{ data: Inspection[] }>({
    path: 'service/inspections',
    query,
  });
  return data;
}

export async function fetchDashboard(api: ApiClient): Promise<DashboardData> {
  const { data } = await api.request<{ data: DashboardData }>({
    path: 'service/dashboard',
  });
  return data;
}

// ------------------------------------------------------------ write helpers

export async function createCustomer(
  api: ApiClient,
  input: CustomerInput,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }>({
    path: 'service/customers',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateCustomer(
  api: ApiClient,
  id: number,
  input: CustomerInput,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }>({
    path: `service/customers/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function createDevice(
  api: ApiClient,
  input: DeviceInput,
): Promise<Device> {
  const { data } = await api.request<{ data: Device }>({
    path: 'service/devices',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateDevice(
  api: ApiClient,
  id: number,
  input: Partial<DeviceInput>,
): Promise<Device> {
  const { data } = await api.request<{ data: Device }>({
    path: `service/devices/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function createTicket(
  api: ApiClient,
  input: TicketInput,
): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }>({
    path: 'service/tickets',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function runTicketAction(
  api: ApiClient,
  id: number,
  action: 'accept' | 'start' | 'submit' | 'confirm' | 'return' | 'reaccept',
  json: Record<string, unknown>,
): Promise<Ticket> {
  const result = await api.request<{ data: Ticket }>({
    path: `service/tickets/${id}/${action}`,
    method: 'POST',
    json,
  });
  return result.data;
}

export async function saveArticle(
  api: ApiClient,
  input: {
    id?: number;
    title: string;
    body: string;
    category?: string | null;
    published: boolean;
  },
): Promise<KnowledgeArticle> {
  const { id, ...json } = input;
  const { data } = await api.request<{ data: KnowledgeArticle }>(
    id
      ? { path: `service/knowledge/articles/${id}`, method: 'PATCH', json }
      : { path: 'service/knowledge/articles', method: 'POST', json },
  );
  return data;
}

export async function uploadAttachment(
  api: ApiClient,
  ticketId: number,
  file: File,
  kind: 'photo' | 'report',
): Promise<Attachment> {
  const body = new FormData();
  body.append('file', file);
  body.append('kind', kind);
  const { data } = await api.request<{ data: Attachment }>({
    path: `service/tickets/${ticketId}/attachments`,
    method: 'POST',
    body,
  });
  return data;
}

export async function deleteAttachment(
  api: ApiClient,
  ticketId: number,
  attachmentId: number,
): Promise<void> {
  await api.request({
    path: `service/tickets/${ticketId}/attachments/${attachmentId}`,
    method: 'DELETE',
  });
}

export async function shareTicket(
  api: ApiClient,
  ticketId: number,
  engineerId: string,
): Promise<void> {
  await api.request({
    path: `service/tickets/${ticketId}/shares`,
    method: 'POST',
    json: { engineerId },
  });
}

export async function revokeShare(
  api: ApiClient,
  ticketId: number,
  shareId: number,
): Promise<void> {
  await api.request({
    path: `service/tickets/${ticketId}/shares/${shareId}`,
    method: 'DELETE',
  });
}

/** One Scheduler execution record produced by a manual "run now". */
export interface DailyRunExecution {
  key: string;
  scheduleId?: string;
  state: string;
  occurrenceId?: string;
  reason?: string;
  result?: unknown;
}

export interface DailyRunResult {
  /** Null when the schedule produced no terminal outcome. */
  generation: { date: string; created: number; skipped: number } | null;
  reminders: { date: string; reminded: number } | null;
  /** What actually happened to each schedule, straight from the Scheduler. */
  executions: DailyRunExecution[];
}

/**
 * Fire the two daily schedules through the Scheduler itself, so the plan detail
 * records the run and its trigger count. The response carries the real
 * execution status, not an assumed success.
 */
export async function runDailyInspections(
  api: ApiClient,
): Promise<DailyRunResult> {
  const { data } = await api.request<{ data: DailyRunResult }>({
    path: 'service/inspections/run-daily',
    method: 'POST',
    json: {},
  });
  return data;
}

export async function completeInspection(
  api: ApiClient,
  id: number,
  input: {
    resultNote: string;
    status?: 'completed' | 'skipped';
    createTicket?: boolean;
  },
): Promise<Inspection> {
  const { data } = await api.request<{ data: Inspection }>({
    path: `service/inspections/${id}/complete`,
    method: 'POST',
    json: input,
  });
  return data;
}

export async function askAssistant(
  api: ApiClient,
  question: string,
  ticketId?: number,
): Promise<AssistantAnswer> {
  const { data } = await api.request<{ data: AssistantAnswer }>({
    path: 'service/assistant/ask',
    method: 'POST',
    json: ticketId === undefined ? { question } : { question, ticketId },
  });
  return data;
}

/** The signed-in user's persisted assistant conversation, oldest first. */
export async function fetchAssistantMessages(
  api: ApiClient,
  query: { ticketId?: number; limit?: number } = {},
): Promise<AssistantMessage[]> {
  const params = new URLSearchParams();
  if (query.ticketId !== undefined) {
    params.set('ticketId', String(query.ticketId));
  }
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  const suffix = params.size ? `?${params.toString()}` : '';
  const { data } = await api.request<{ data: AssistantMessage[] }>({
    path: `service/assistant/messages${suffix}`,
  });
  return data;
}

/**
 * Reads an attachment's bytes through the authorized endpoint and returns an
 * object URL. The bytes never travel through a public link, so a user without
 * access to the ticket cannot open the file by guessing its URL.
 */
export async function fetchAttachmentObjectUrl(
  api: ApiClient,
  ticketId: number,
  attachmentId: number,
): Promise<string> {
  const stream = await api.stream({
    path: `service/tickets/${ticketId}/attachments/${attachmentId}/content`,
  });
  const blob = await new Response(stream).blob();
  return URL.createObjectURL(blob);
}

export async function downloadAttachment(
  api: ApiClient,
  ticketId: number,
  attachment: Attachment,
): Promise<void> {
  const url = await fetchAttachmentObjectUrl(api, ticketId, attachment.id);
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** An identification-only view of an API key; the secret is never returned. */
export interface IntegrationKey {
  readonly id: string;
  readonly name: string;
  readonly hint: string;
  readonly enabled: boolean;
  readonly expiresAt?: string | null;
  readonly lastRequest?: string | null;
  readonly createdAt?: string | null;
  readonly userId: string;
}

/** An account an administrator may bind an integration key to. */
export interface IntegrationKeyTarget {
  readonly id: string;
  readonly name: string;
  readonly username?: string | null;
  readonly email: string;
}

export async function fetchIntegrationKeyTargets(
  api: ApiClient,
): Promise<IntegrationKeyTarget[]> {
  const { data } = await api.request<{ data: IntegrationKeyTarget[] }>({
    path: 'service/integration-keys/targets',
  });
  return data;
}

export async function fetchIntegrationKeys(
  api: ApiClient,
  userId?: string,
): Promise<IntegrationKey[]> {
  const suffix = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const { data } = await api.request<{ data: IntegrationKey[] }>({
    path: `service/integration-keys${suffix}`,
  });
  return data;
}

export async function createIntegrationKey(
  api: ApiClient,
  input: { userId?: string; name: string; expiresIn?: number | null },
): Promise<{ key: IntegrationKey; secret: string }> {
  const result = await api.request<{ data: IntegrationKey; secret: string }>({
    path: 'service/integration-keys',
    method: 'POST',
    json: input,
  });
  return { key: result.data, secret: result.secret };
}

export async function revokeIntegrationKey(
  api: ApiClient,
  id: string,
): Promise<void> {
  await api.request({
    path: `service/integration-keys/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}
