import { resolveAppUrl, type ApiClient } from '@nocobase/app-client';

import type {
  AssistantStatus,
  CreateOrderInput,
  CreatedIntegrationKey,
  Customer,
  DashboardSummary,
  Device,
  DeviceManual,
  DirectoryUser,
  InspectionResult,
  IntegrationKey,
  ListMeta,
  OrderListQuery,
  OrderTimeline,
  RepairKnowledge,
  ServiceGroup,
  ServiceInspection,
  ServiceList,
  ServiceOrder,
  ServiceOrderFile,
  ServiceOrderShare,
} from './service-types.js';

/**
 * The typed calls of the after-sales service API.
 *
 * Every function takes the shared `ApiClient` (obtained with `useApiClient()`
 * in a component) and never builds a URL by hand: the client's base URL already
 * carries the deployment mount path. The endpoints are the ones this
 * application registers under `server/routes/`; the API document at
 * `/api/swagger` lists them with the same operation ids.
 */

function encodeId(value: string | number): string {
  return encodeURIComponent(String(value));
}

/** Drops `undefined` so an absent filter is not serialized as an empty parameter. */
function queryOf(
  values: Readonly<Record<string, string | number | undefined>>,
): Record<string, string | number> {
  const query: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) query[key] = value;
  }
  return query;
}

// --- Service orders ---------------------------------------------------------

export async function listOrders(
  api: ApiClient,
  query: OrderListQuery = {},
  signal?: AbortSignal,
): Promise<ServiceList<ServiceOrder>> {
  return api.request<ServiceList<ServiceOrder>>({
    path: 'serviceOrders',
    query: queryOf({
      keyword: query.keyword,
      status: query.status,
      priority: query.priority,
      assigneeId: query.assigneeId,
      customerId: query.customerId,
      deviceId: query.deviceId,
      limit: query.limit,
      offset: query.offset,
    }),
    signal,
  });
}

export async function getOrder(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<ServiceOrder> {
  const { data } = await api.request<{ data: ServiceOrder }>({
    path: `serviceOrders/${encodeId(id)}`,
    signal,
  });
  return data;
}

export async function createOrder(
  api: ApiClient,
  input: CreateOrderInput,
): Promise<{ order: ServiceOrder; created: boolean }> {
  const { data } = await api.request<{
    data: { order: ServiceOrder; created: boolean };
  }>({
    path: 'serviceOrders',
    method: 'POST',
    json: input,
  });
  return data;
}

/** Accepting an order runs through the acceptance workflow; `viaWorkflow` reports whether it did. */
export async function acceptOrder(
  api: ApiClient,
  id: number,
  acceptanceNote?: string | null,
): Promise<{ order: ServiceOrder; viaWorkflow: boolean }> {
  const { data } = await api.request<{
    data: { order: ServiceOrder; viaWorkflow: boolean };
  }>({
    path: `serviceOrders/${encodeId(id)}/accept`,
    method: 'POST',
    json: { acceptanceNote: acceptanceNote ?? null },
  });
  return data;
}

export async function startOrder(
  api: ApiClient,
  id: number,
): Promise<ServiceOrder> {
  const { data } = await api.request<{ data: ServiceOrder }>({
    path: `serviceOrders/${encodeId(id)}/start`,
    method: 'POST',
  });
  return data;
}

export async function submitOrder(
  api: ApiClient,
  id: number,
  resolution: string,
): Promise<ServiceOrder> {
  const { data } = await api.request<{ data: ServiceOrder }>({
    path: `serviceOrders/${encodeId(id)}/submit`,
    method: 'POST',
    json: { resolution },
  });
  return data;
}

export async function confirmOrder(
  api: ApiClient,
  id: number,
): Promise<ServiceOrder> {
  const { data } = await api.request<{ data: ServiceOrder }>({
    path: `serviceOrders/${encodeId(id)}/confirm`,
    method: 'POST',
  });
  return data;
}

export async function returnOrder(
  api: ApiClient,
  id: number,
  returnReason: string,
): Promise<ServiceOrder> {
  const { data } = await api.request<{ data: ServiceOrder }>({
    path: `serviceOrders/${encodeId(id)}/return`,
    method: 'POST',
    json: { returnReason },
  });
  return data;
}

export interface AssignOrderChanges {
  readonly assigneeId?: string | null;
  readonly groupId?: number | null;
  readonly dueAt?: string | null;
  readonly priority?: string;
  readonly observerVisible?: boolean;
}

export async function assignOrder(
  api: ApiClient,
  id: number,
  changes: AssignOrderChanges,
): Promise<ServiceOrder> {
  const { data } = await api.request<{ data: ServiceOrder }>({
    path: `serviceOrders/${encodeId(id)}/assign`,
    method: 'POST',
    json: changes,
  });
  return data;
}

export async function getOrderTimeline(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<OrderTimeline> {
  const { data } = await api.request<{ data: OrderTimeline }>({
    path: `serviceOrders/${encodeId(id)}/timeline`,
    signal,
  });
  return data;
}

export async function grantOrderShare(
  api: ApiClient,
  id: number,
  input: { engineerId: string; note?: string | null; expiresAt?: string },
): Promise<ServiceOrderShare> {
  const { data } = await api.request<{ data: ServiceOrderShare }>({
    path: `serviceOrders/${encodeId(id)}/shares`,
    method: 'POST',
    json: input,
  });
  return data;
}

export async function revokeOrderShare(
  api: ApiClient,
  id: number,
  shareId: number,
): Promise<ServiceOrderShare> {
  const { data } = await api.request<{ data: ServiceOrderShare }>({
    path: `serviceOrders/${encodeId(id)}/shares/${encodeId(shareId)}`,
    method: 'DELETE',
  });
  return data;
}

// --- Attachments ------------------------------------------------------------

export async function listOrderAttachments(
  api: ApiClient,
  orderId: number,
  signal?: AbortSignal,
): Promise<readonly ServiceOrderFile[]> {
  const { data } = await api.request<{ data: readonly ServiceOrderFile[] }>({
    path: `serviceOrders/${encodeId(orderId)}/attachments`,
    signal,
  });
  return data;
}

export async function uploadOrderAttachment(
  api: ApiClient,
  orderId: number,
  file: File,
  category?: string,
): Promise<ServiceOrderFile> {
  const body = new FormData();
  body.append('file', file);
  if (category) body.append('category', category);
  const { data } = await api.request<{ data: ServiceOrderFile }>({
    path: `serviceOrders/${encodeId(orderId)}/attachments`,
    method: 'POST',
    body,
  });
  return data;
}

export async function removeOrderAttachment(
  api: ApiClient,
  orderId: number,
  fileId: string,
): Promise<{ removed: boolean }> {
  const { data } = await api.request<{ data: { removed: boolean } }>({
    path: `serviceOrders/${encodeId(orderId)}/attachments/${encodeId(fileId)}`,
    method: 'DELETE',
  });
  return data;
}

/**
 * The URL bytes are read from. It is a real URL rather than a request because
 * an `<img>`, a download link and the preview components need one; the route
 * checks the session and the permission on every read.
 */
export function attachmentContentUrl(orderId: number, fileId: string): string {
  return resolveAppUrl(
    `/api/serviceOrders/${encodeId(orderId)}/attachments/${encodeId(fileId)}/content`,
  );
}

// --- Catalog ----------------------------------------------------------------

export async function listServiceGroups(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<readonly ServiceGroup[]> {
  const { data } = await api.request<{ data: readonly ServiceGroup[] }>({
    path: 'serviceGroups',
    signal,
  });
  return data;
}

export async function listCustomers(
  api: ApiClient,
  keyword?: string,
  signal?: AbortSignal,
): Promise<ServiceList<Customer>> {
  return api.request<ServiceList<Customer>>({
    path: 'customers',
    query: queryOf({ keyword, limit: 100 }),
    signal,
  });
}

export async function createCustomer(
  api: ApiClient,
  input: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>> & {
    name: string;
  },
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }>({
    path: 'customers',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function getCustomer(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }>({
    path: `customers/${encodeId(id)}`,
    signal,
  });
  return data;
}

export async function updateCustomer(
  api: ApiClient,
  id: number,
  input: Record<string, unknown>,
): Promise<Customer> {
  const { data } = await api.request<{ data: Customer }>({
    path: `customers/${encodeId(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function listDevices(
  api: ApiClient,
  filters: { customerId?: number; engineerId?: string; keyword?: string } = {},
  signal?: AbortSignal,
): Promise<ServiceList<Device>> {
  return api.request<ServiceList<Device>>({
    path: 'devices',
    query: queryOf({
      customerId: filters.customerId,
      engineerId: filters.engineerId,
      keyword: filters.keyword,
      limit: 100,
    }),
    signal,
  });
}

export async function createDevice(
  api: ApiClient,
  input: Record<string, unknown> & {
    code: string;
    name: string;
    customerId: number;
  },
): Promise<Device> {
  const { data } = await api.request<{ data: Device }>({
    path: 'devices',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function getDevice(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<Device> {
  const { data } = await api.request<{ data: Device }>({
    path: `devices/${encodeId(id)}`,
    signal,
  });
  return data;
}

export async function updateDevice(
  api: ApiClient,
  id: number,
  input: Record<string, unknown>,
): Promise<Device> {
  const { data } = await api.request<{ data: Device }>({
    path: `devices/${encodeId(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

// --- Knowledge and manuals --------------------------------------------------

export async function listKnowledge(
  api: ApiClient,
  filters: { status?: string; category?: string; keyword?: string } = {},
  signal?: AbortSignal,
): Promise<ServiceList<RepairKnowledge>> {
  return api.request<ServiceList<RepairKnowledge>>({
    path: 'repairKnowledge',
    query: queryOf({
      status: filters.status,
      category: filters.category,
      keyword: filters.keyword,
      limit: 100,
    }),
    signal,
  });
}

export async function createKnowledge(
  api: ApiClient,
  input: {
    title: string;
    content: string;
    category?: string | null;
    status?: 'draft' | 'published';
  },
): Promise<RepairKnowledge> {
  const { data } = await api.request<{ data: RepairKnowledge }>({
    path: 'repairKnowledge',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function getKnowledge(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<RepairKnowledge> {
  const { data } = await api.request<{ data: RepairKnowledge }>({
    path: `repairKnowledge/${encodeId(id)}`,
    signal,
  });
  return data;
}

export async function updateKnowledge(
  api: ApiClient,
  id: number,
  input: Record<string, unknown>,
): Promise<RepairKnowledge> {
  const { data } = await api.request<{ data: RepairKnowledge }>({
    path: `repairKnowledge/${encodeId(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function setKnowledgePublished(
  api: ApiClient,
  id: number,
  published: boolean,
): Promise<RepairKnowledge> {
  const { data } = await api.request<{ data: RepairKnowledge }>({
    path: `repairKnowledge/${encodeId(id)}/${published ? 'publish' : 'unpublish'}`,
    method: 'POST',
  });
  return data;
}

export async function listManuals(
  api: ApiClient,
  filters: { status?: string; deviceId?: number } = {},
  signal?: AbortSignal,
): Promise<ServiceList<DeviceManual>> {
  return api.request<ServiceList<DeviceManual>>({
    path: 'deviceManuals',
    query: queryOf({
      status: filters.status,
      deviceId: filters.deviceId,
      limit: 100,
    }),
    signal,
  });
}

export async function getManual(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<DeviceManual> {
  const { data } = await api.request<{ data: DeviceManual }>({
    path: `deviceManuals/${encodeId(id)}`,
    signal,
  });
  return data;
}

export async function createManual(
  api: ApiClient,
  input: { title: string; content: string; deviceId?: number | null },
): Promise<DeviceManual> {
  const { data } = await api.request<{ data: DeviceManual }>({
    path: 'deviceManuals',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function reindexManual(
  api: ApiClient,
  id: number,
): Promise<{ status: 'ready' | 'pending' | 'failed'; detail: string }> {
  const { data } = await api.request<{
    data: { status: 'ready' | 'pending' | 'failed'; detail: string };
  }>({
    path: `deviceManuals/${encodeId(id)}/reindex`,
    method: 'POST',
  });
  return data;
}

// --- Inspections and dashboard ---------------------------------------------

export async function listInspections(
  api: ApiClient,
  filters: { status?: string; deviceId?: number; assigneeId?: string } = {},
  signal?: AbortSignal,
): Promise<ServiceList<ServiceInspection>> {
  return api.request<ServiceList<ServiceInspection>>({
    path: 'serviceInspections',
    query: queryOf({
      status: filters.status,
      deviceId: filters.deviceId,
      assigneeId: filters.assigneeId,
      limit: 100,
    }),
    signal,
  });
}

export async function getInspection(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<ServiceInspection> {
  const { data } = await api.request<{ data: ServiceInspection }>({
    path: `serviceInspections/${encodeId(id)}`,
    signal,
  });
  return data;
}

export async function createInspection(
  api: ApiClient,
  input: { deviceId: number; plannedDate: string; assigneeId?: string | null },
): Promise<ServiceInspection> {
  const { data } = await api.request<{ data: ServiceInspection }>({
    path: 'serviceInspections',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function completeInspection(
  api: ApiClient,
  id: number,
  input: {
    result: InspectionResult;
    resultCode: string;
    nextDate?: string | null;
  },
): Promise<ServiceInspection> {
  const { data } = await api.request<{ data: ServiceInspection }>({
    path: `serviceInspections/${encodeId(id)}/complete`,
    method: 'POST',
    json: input,
  });
  return data;
}

export async function getDashboardSummary(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<DashboardSummary> {
  const { data } = await api.request<{ data: DashboardSummary }>({
    path: 'serviceDashboard/summary',
    signal,
  });
  return data;
}

/**
 * What the server has registered for the AI service assistant.
 *
 * This reads the real registration state, so an application whose AI plugins
 * are absent reports them absent instead of a page inventing a conversation.
 */
export async function getAssistantStatus(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<AssistantStatus> {
  const { data } = await api.request<{ data: AssistantStatus }>({
    path: 'serviceAssistant/status',
    signal,
  });
  return data;
}

/** Re-exported so a page that only shapes a list does not import the api module twice. */
export type { DirectoryUser, ListMeta };

// --- User directory ---------------------------------------------------------

/**
 * The users an engineer may be assigned from.
 *
 * It is the users plugin's own list endpoint, so it answers with the enabled
 * directory the caller is allowed to read and 403s for a role that is not — the
 * page does not decide who is a candidate engineer, the permission does.
 */
export async function listDirectoryUsers(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<readonly DirectoryUser[]> {
  const { data } = await api.request<{ data: readonly DirectoryUser[] }>({
    path: 'users',
    query: { pageSize: 100 },
    signal,
  });
  return data;
}

// --- Integration account API keys -------------------------------------------

/**
 * The external platform's machine-account API keys.
 *
 * The key belongs to the user holding the `service.integrator` permission set;
 * a supervisor manages it through the `service.integration.manage` capability,
 * which the server enforces. The secret is only present on the create answer.
 */
export async function listIntegrationKeys(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<readonly IntegrationKey[]> {
  const { data } = await api.request<{ data: readonly IntegrationKey[] }>({
    path: 'integration/keys',
    signal,
  });
  return data;
}

export async function createIntegrationKey(
  api: ApiClient,
  input: { name: string; expiresInDays?: number | null },
): Promise<CreatedIntegrationKey> {
  const { data } = await api.request<{ data: CreatedIntegrationKey }>({
    path: 'integration/keys',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function revokeIntegrationKey(
  api: ApiClient,
  keyId: string,
): Promise<void> {
  await api.request<{ data: { removed: boolean } }>({
    path: `integration/keys/${encodeId(keyId)}`,
    method: 'DELETE',
  });
}
