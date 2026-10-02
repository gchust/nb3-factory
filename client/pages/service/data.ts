import type { ApiClient } from '@nocobase/app-client';

/**
 * The business vocabulary and HTTP calls of the equipment after-sales desk.
 *
 * Kept out of the page components so Fast Refresh keeps working (a module that exports both a component and a
 * constant is not refreshable) and so every page names the same status, priority and endpoint.
 */

export interface WorkOrder {
  readonly id: number;
  readonly code: string | null;
  readonly title: string;
  readonly source: string;
  readonly reporterId: string | null;
  readonly customerId: number;
  readonly equipmentId: number;
  readonly description: string | null;
  readonly priority: string;
  readonly confidential: boolean;
  readonly deadline: string | null;
  readonly assigneeId: string | null;
  readonly supervisorId: string | null;
  readonly status: string;
  readonly acceptanceNote: string | null;
  readonly resolutionNote: string | null;
  readonly returnReason: string | null;
  readonly acceptedAt: string | null;
  readonly startedAt: string | null;
  readonly submittedAt: string | null;
  readonly closedAt: string | null;
  readonly externalEventId: string | null;
  readonly createdById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkOrderEvent {
  readonly id: number;
  readonly workOrderId: number;
  readonly type: string;
  readonly status: string;
  readonly message: string | null;
  readonly actorId: string | null;
  readonly createdAt: string;
}

export interface WorkOrderShare {
  readonly id: number;
  readonly workOrderId: number;
  readonly engineerId: string;
  readonly grantedById: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
}

export interface WorkOrderAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
}

export interface WorkOrderDetail {
  readonly workOrder: WorkOrder;
  readonly events: WorkOrderEvent[];
  readonly shares: WorkOrderShare[];
  readonly attachments: WorkOrderAttachment[];
  /** The transitions the server will accept for this caller; an empty list means no action is offered. */
  readonly transitions: WorkOrderTransition[];
  /** Whether this caller may create or revoke collaboration shares for this work order. */
  readonly canManageShares: boolean;
}

export interface Page<TItem> {
  readonly items: TItem[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly code: string | null;
  readonly level: string | null;
  readonly contact: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Equipment {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly model: string | null;
  readonly serialNumber: string | null;
  readonly location: string | null;
  readonly status: string;
  readonly customerId: number;
  readonly engineerId: string | null;
  readonly enabled: boolean;
  readonly nextInspectionDate: string | null;
  readonly warrantyUntil: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Inspection {
  readonly id: number;
  readonly code: string | null;
  readonly equipmentId: number;
  readonly planDate: string;
  readonly dueDate: string | null;
  readonly assigneeId: string | null;
  readonly status: string;
  readonly result: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Knowledge {
  readonly id: number;
  readonly title: string;
  readonly category: string | null;
  readonly tags: string | null;
  readonly symptom: string | null;
  readonly content: string | null;
  readonly published: boolean;
  readonly viewCount: number;
  readonly createdById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Manual {
  readonly id: number;
  readonly title: string;
  readonly version: string;
  readonly equipmentId: number;
  readonly summary: string | null;
  readonly content: string | null;
  readonly filename: string | null;
  readonly published: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DirectoryProfile {
  readonly id: number;
  readonly userId: string;
  readonly groupId: number | null;
  readonly name: string;
}

export interface Directory {
  readonly groups: { id: number; code: string; name: string }[];
  readonly profiles: DirectoryProfile[];
}

export interface DashboardSummary {
  readonly pending: number;
  readonly processing: number;
  readonly pendingConfirmation: number;
  readonly closed: number;
  readonly overdue: number;
  readonly total: number;
  readonly byEngineer: { assigneeId: string | null; count: number }[];
}

export const WORK_ORDER_STATUS = {
  PENDING_ACCEPTANCE: 'pending_acceptance',
  PENDING_PROCESSING: 'pending_processing',
  PROCESSING: 'processing',
  PENDING_CONFIRMATION: 'pending_confirmation',
  CLOSED: 'closed',
  RETURNED: 'returned',
} as const;

export const WORK_ORDER_PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export const WORK_ORDER_STATUS_FLOW = [
  WORK_ORDER_STATUS.PENDING_ACCEPTANCE,
  WORK_ORDER_STATUS.PENDING_PROCESSING,
  WORK_ORDER_STATUS.PROCESSING,
  WORK_ORDER_STATUS.PENDING_CONFIRMATION,
  WORK_ORDER_STATUS.CLOSED,
] as const;

export const INSPECTION_STATUS = {
  PENDING: 'pending',
  DONE: 'done',
  OVERDUE: 'overdue',
  SKIPPED: 'skipped',
} as const;

export const EQUIPMENT_STATUS = ['active', 'maintenance', 'retired'] as const;

export const WORK_ORDER_STATUS_LABEL: Record<string, string> = {
  pending_acceptance: 'service.status.pendingAcceptance',
  pending_processing: 'service.status.pendingProcessing',
  processing: 'service.status.processing',
  pending_confirmation: 'service.status.pendingConfirmation',
  closed: 'service.status.closed',
  returned: 'service.status.returned',
};

export const WORK_ORDER_PRIORITY_LABEL: Record<string, string> = {
  low: 'service.priority.low',
  normal: 'service.priority.normal',
  high: 'service.priority.high',
  urgent: 'service.priority.urgent',
};

export const INSPECTION_STATUS_LABEL: Record<string, string> = {
  pending: 'service.inspectionStatus.pending',
  done: 'service.inspectionStatus.done',
  overdue: 'service.inspectionStatus.overdue',
  skipped: 'service.inspectionStatus.skipped',
};

export const EQUIPMENT_STATUS_LABEL: Record<string, string> = {
  active: 'service.equipmentStatus.active',
  maintenance: 'service.equipmentStatus.maintenance',
  retired: 'service.equipmentStatus.retired',
};

export const WORK_ORDER_EVENT_LABEL: Record<string, string> = {
  created: 'service.event.created',
  auto_accepted: 'service.event.autoAccepted',
  escalated: 'service.event.escalated',
  accepted: 'service.event.accepted',
  started: 'service.event.started',
  submitted: 'service.event.submitted',
  confirmed: 'service.event.confirmed',
  returned: 'service.event.returned',
  shared: 'service.event.shared',
  share_revoked: 'service.event.shareRevoked',
  notified: 'service.event.notified',
  overdue_reminder: 'service.event.overdueReminder',
  integration_ingested: 'service.event.integrationIngested',
};

export const WORK_ORDER_TRANSITIONS = [
  'accept',
  'start',
  'submit',
  'confirm',
  'return',
] as const;

export type WorkOrderTransition = (typeof WORK_ORDER_TRANSITIONS)[number];

const workOrderPath = (id: number | string): string =>
  `service/work-orders/${encodeURIComponent(id)}`;

// --------------------------------------------------------------------------------------------------- work orders

export interface WorkOrderQuery {
  readonly status?: string;
  readonly priority?: string;
  readonly assigneeId?: string;
  readonly source?: string;
  readonly keyword?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export async function listWorkOrders(
  api: ApiClient,
  query: WorkOrderQuery = {},
): Promise<Page<WorkOrder>> {
  const { data } = await api.request<{ data: Page<WorkOrder> }>({
    path: 'service/work-orders',
    query: { ...query },
  });
  return data;
}

export async function getWorkOrder(
  api: ApiClient,
  id: number | string,
): Promise<WorkOrderDetail> {
  const { data } = await api.request<{ data: WorkOrderDetail }>({
    path: workOrderPath(id),
  });
  return data;
}

export interface WorkOrderInput {
  readonly title: string;
  readonly customerId: number;
  readonly equipmentId: number;
  readonly description?: string;
  readonly priority?: string;
  readonly confidential?: boolean;
  readonly deadline?: string | null;
  readonly assigneeId?: string | null;
}

export async function createWorkOrder(
  api: ApiClient,
  input: WorkOrderInput,
): Promise<WorkOrder> {
  const { data } = await api.request<{ data: WorkOrder }, WorkOrderInput>({
    path: 'service/work-orders',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function transitionWorkOrder(
  api: ApiClient,
  id: number | string,
  transition: WorkOrderTransition,
  input: {
    note?: string;
    resolutionNote?: string;
    returnReason?: string;
    assigneeId?: string | null;
  },
): Promise<{ workOrder: WorkOrder; event: WorkOrderEvent }> {
  const { data } = await api.request<
    { data: { workOrder: WorkOrder; event: WorkOrderEvent } },
    typeof input
  >({
    path: `${workOrderPath(id)}/${transition}`,
    method: 'POST',
    json: input,
  });
  return data;
}

export async function deleteWorkOrder(
  api: ApiClient,
  id: number | string,
): Promise<void> {
  await api.request<void>({ path: workOrderPath(id), method: 'DELETE' });
}

export async function shareWorkOrder(
  api: ApiClient,
  id: number | string,
  engineerId: string,
): Promise<WorkOrderShare> {
  const { data } = await api.request<
    { data: WorkOrderShare },
    { engineerId: string }
  >({
    path: `${workOrderPath(id)}/shares`,
    method: 'POST',
    json: { engineerId },
  });
  return data;
}

export async function revokeWorkOrderShare(
  api: ApiClient,
  id: number | string,
  shareId: number,
): Promise<WorkOrderShare> {
  const { data } = await api.request<{ data: WorkOrderShare }>({
    path: `${workOrderPath(id)}/shares/${shareId}`,
    method: 'DELETE',
  });
  return data;
}

export async function uploadAttachment(
  api: ApiClient,
  id: number | string,
  file: File,
): Promise<WorkOrderAttachment> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.request<{ data: WorkOrderAttachment }>({
    path: `${workOrderPath(id)}/attachments`,
    method: 'POST',
    body: form,
  });
  return data;
}

export async function deleteAttachment(
  api: ApiClient,
  attachmentId: string,
): Promise<void> {
  await api.request<void>({
    path: `service/attachments/${encodeURIComponent(attachmentId)}`,
    method: 'DELETE',
  });
}

// ------------------------------------------------------------------------------------------------------- ledger

export async function listCustomers(
  api: ApiClient,
  query: { keyword?: string } = {},
): Promise<Page<Customer>> {
  const { data } = await api.request<{ data: Page<Customer> }>({
    path: 'service/customers',
    query: { ...query },
  });
  return data;
}

export type CustomerInput = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;

export async function createCustomer(
  api: ApiClient,
  input: CustomerInput,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }, CustomerInput>({
    path: 'service/customers',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateCustomer(
  api: ApiClient,
  id: number,
  input: Partial<CustomerInput>,
): Promise<Customer> {
  const { data } = await api.request<
    { data: Customer },
    Partial<CustomerInput>
  >({ path: `service/customers/${id}`, method: 'PATCH', json: input });
  return data;
}

export async function deleteCustomer(
  api: ApiClient,
  id: number,
): Promise<void> {
  await api.request<void>({
    path: `service/customers/${id}`,
    method: 'DELETE',
  });
}

export async function listEquipment(
  api: ApiClient,
  query: { keyword?: string; status?: string; customerId?: number } = {},
): Promise<Page<Equipment>> {
  const { data } = await api.request<{ data: Page<Equipment> }>({
    path: 'service/equipment',
    query: { ...query },
  });
  return data;
}

export type EquipmentInput = Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>;

export async function createEquipment(
  api: ApiClient,
  input: EquipmentInput,
): Promise<Equipment> {
  const { data } = await api.request<{ data: Equipment }, EquipmentInput>({
    path: 'service/equipment',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateEquipment(
  api: ApiClient,
  id: number,
  input: Partial<EquipmentInput>,
): Promise<Equipment> {
  const { data } = await api.request<
    { data: Equipment },
    Partial<EquipmentInput>
  >({ path: `service/equipment/${id}`, method: 'PATCH', json: input });
  return data;
}

export async function listKnowledge(
  api: ApiClient,
  query: { keyword?: string; published?: boolean } = {},
): Promise<Page<Knowledge>> {
  const { data } = await api.request<{ data: Page<Knowledge> }>({
    path: 'service/knowledge',
    query: {
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.published === undefined
        ? {}
        : { published: String(query.published) }),
    },
  });
  return data;
}

export type KnowledgeInput = Omit<
  Knowledge,
  'id' | 'viewCount' | 'createdById' | 'createdAt' | 'updatedAt'
>;

export async function createKnowledge(
  api: ApiClient,
  input: KnowledgeInput,
): Promise<Knowledge> {
  const { data } = await api.request<{ data: Knowledge }, KnowledgeInput>({
    path: 'service/knowledge',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateKnowledge(
  api: ApiClient,
  id: number,
  input: Partial<KnowledgeInput>,
): Promise<Knowledge> {
  const { data } = await api.request<
    { data: Knowledge },
    Partial<KnowledgeInput>
  >({ path: `service/knowledge/${id}`, method: 'PATCH', json: input });
  return data;
}

export async function deleteKnowledge(
  api: ApiClient,
  id: number,
): Promise<void> {
  await api.request<void>({
    path: `service/knowledge/${id}`,
    method: 'DELETE',
  });
}

export async function listManuals(
  api: ApiClient,
  query: { keyword?: string; equipmentId?: number } = {},
): Promise<Page<Manual>> {
  const { data } = await api.request<{ data: Page<Manual> }>({
    path: 'service/manuals',
    query: { ...query },
  });
  return data;
}

export type ManualInput = Omit<Manual, 'id' | 'createdAt' | 'updatedAt'>;

export async function createManual(
  api: ApiClient,
  input: ManualInput,
): Promise<Manual> {
  const { data } = await api.request<{ data: Manual }, ManualInput>({
    path: 'service/manuals',
    method: 'POST',
    json: input,
  });
  return data;
}

/**
 * The real state of the AI Knowledge Base the equipment manuals are meant to feed.
 *
 * A manual can be stored before the retrieval stack exists, and it can be stored after one is configured. Rather than
 * assume either, the page reads the three services that actually answer the question: the knowledge bases, the
 * enabled vector databases, and the configured LLM services. A LOCAL base cannot be created without all three, so
 * `ready` is only true when the plugin really can process an upload. When it is false, `missing` names exactly what
 * is absent instead of pretending the manual is searchable.
 */
export interface AiManualDocument {
  readonly title: string;
  readonly filename: string | null;
  readonly indexStatus: string;
  readonly segmentStatus: string | null;
  readonly errorMessage: string | null;
}

export interface AiManualStatus {
  readonly knowledgeBases: readonly {
    readonly key: string;
    readonly name: string;
  }[];
  readonly documents: readonly AiManualDocument[];
  readonly vectorDatabases: number;
  readonly llmServices: number;
  readonly ready: boolean;
  readonly missing: readonly string[];
  /** True when the signed-in user may not read the AI service configuration; the card is hidden for them. */
  readonly restricted: boolean;
}

/** Resolve to `undefined` instead of rejecting, so one restricted sub-request never fails the whole status. */
async function soft<T>(request: Promise<T>): Promise<T | undefined> {
  try {
    return await request;
  } catch {
    return undefined;
  }
}

export async function getAiManualStatus(
  api: ApiClient,
): Promise<AiManualStatus> {
  const [bases, docs, vectors, llms] = await Promise.all([
    soft(
      api.request<{ data: { data: { key: string; name: string }[] } }>({
        path: 'ai/aiKnowledgeBase:list',
      }),
    ),
    soft(
      api.request<{
        data: {
          data: {
            title: string;
            filename: string | null;
            indexStatus: string;
            segmentStatus: string | null;
            errorMessage: string | null;
          }[];
        };
      }>({ path: 'ai/aiKnowledgeBaseDocs:list' }),
    ),
    soft(
      api.request<{ data: unknown[] }>({
        path: 'ai/aiVectorDatabases:listEnabled',
      }),
    ),
    soft(api.request<{ data: unknown[] }>({ path: 'ai/llmServices:list' })),
  ]);
  // Reading the LLM services requires AI settings access. A user without it (an engineer reading manuals) sees no
  // card rather than a false "no model configured", which is the administrator's diagnosis to make.
  if (llms === undefined) {
    return {
      knowledgeBases: [],
      documents: [],
      vectorDatabases: 0,
      llmServices: 0,
      ready: false,
      missing: [],
      restricted: true,
    };
  }
  const knowledgeBases = (bases?.data.data ?? []).map((base) => ({
    key: base.key,
    name: base.name,
  }));
  const documents = (docs?.data.data ?? []).map((doc) => ({
    title: doc.title,
    filename: doc.filename,
    indexStatus: doc.indexStatus,
    segmentStatus: doc.segmentStatus,
    errorMessage: doc.errorMessage,
  }));
  const vectorDatabases = vectors?.data.length ?? 0;
  const llmServices = llms.data.length;
  const missing: string[] = [];
  if (vectorDatabases === 0) missing.push('service.manuals.ai.missingVector');
  if (llmServices === 0) missing.push('service.manuals.ai.missingLlm');
  if (knowledgeBases.length === 0)
    missing.push('service.manuals.ai.missingBase');
  return {
    knowledgeBases,
    documents,
    vectorDatabases,
    llmServices,
    ready: missing.length === 0,
    missing,
    restricted: false,
  };
}

// -------------------------------------------------------------------------------------------------- inspections

export async function listInspections(
  api: ApiClient,
  query: { status?: string; assigneeId?: string } = {},
): Promise<Page<Inspection>> {
  const { data } = await api.request<{ data: Page<Inspection> }>({
    path: 'service/inspections',
    query: { ...query },
  });
  return data;
}

export async function createInspection(
  api: ApiClient,
  input: { equipmentId: number; planDate?: string; dueDate?: string },
): Promise<Inspection> {
  const { data } = await api.request<{ data: Inspection }, typeof input>({
    path: 'service/inspections',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function completeInspection(
  api: ApiClient,
  id: number,
  result: string,
): Promise<Inspection> {
  const { data } = await api.request<{ data: Inspection }, { result: string }>({
    path: `service/inspections/${id}/complete`,
    method: 'POST',
    json: { result },
  });
  return data;
}

export async function generateInspections(
  api: ApiClient,
): Promise<{ created: number }> {
  const { data } = await api.request<{ data: { created: number } }>({
    path: 'service/inspections/generate',
    method: 'POST',
    json: {},
  });
  return data;
}

export async function flagOverdueInspections(
  api: ApiClient,
): Promise<{ notified: number; workOrders: WorkOrder[] }> {
  const { data } = await api.request<{
    data: { notified: number; workOrders: WorkOrder[] };
  }>({ path: 'service/inspections/overdue', method: 'POST', json: {} });
  return data;
}

// -------------------------------------------------------------------------------------------------- dashboard

export async function getDashboard(api: ApiClient): Promise<DashboardSummary> {
  const { data } = await api.request<{ data: DashboardSummary }>({
    path: 'service/dashboard',
  });
  return data;
}

export async function getDirectory(api: ApiClient): Promise<Directory> {
  const { data } = await api.request<{ data: Directory }>({
    path: 'service/directory',
  });
  return data;
}

/** A short date for a timestamp, or an em dash when the value is absent. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(0, 10);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

export function toDateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/** Read the human-readable message of an unknown error. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return String(error);
}
