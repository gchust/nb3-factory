import { ApiClientError, type ApiClient } from '@nocobase/app-client';

export type OrderStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type ReceiptStatus = 'pending' | 'partial' | 'received';
export type AttachmentTargetType = 'supplier' | 'order' | 'receipt';
export type AttachmentCategory =
  | 'license'
  | 'qualification'
  | 'quotation'
  | 'contract'
  | 'signed_photo'
  | 'delivery_note';

export interface Principal {
  readonly userId: string;
  readonly name: string;
  readonly roles: readonly ('manager' | 'buyer' | 'warehouse')[];
  readonly isAdministrator: boolean;
}

export interface Supplier {
  readonly id: number;
  readonly name: string;
  readonly contactName: string | null;
  readonly phone: string | null;
  readonly status: 'active' | 'inactive';
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly remark: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface Material {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly spec: string | null;
  readonly unit: string;
}

export interface OrderItem {
  readonly id: number;
  readonly materialId: number;
  readonly materialCode: string;
  readonly materialName: string;
  readonly spec: string | null;
  readonly unit: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
  readonly receivedQuantity: number;
  readonly remainingQuantity: number;
  readonly expectedDate: string | null;
  readonly remark: string | null;
}

export interface Order {
  readonly id: number;
  readonly orderNo: string;
  readonly supplierId: number;
  readonly supplierName: string | null;
  readonly buyerId: string;
  readonly buyerName: string | null;
  readonly status: OrderStatus;
  readonly totalAmount: number;
  readonly remark: string | null;
  readonly rejectReason: string | null;
  readonly submittedAt: string | null;
  readonly reviewedAt: string | null;
  readonly reviewerId: string | null;
  readonly reviewerName: string | null;
  readonly receiptStatus: ReceiptStatus;
  readonly itemCount: number;
  readonly receivedItemCount: number;
  readonly receivedAmount: number;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly items?: readonly OrderItem[];
}

export interface ReceiptItem {
  readonly id: number;
  readonly orderItemId: number;
  readonly materialId: number | null;
  readonly materialCode: string;
  readonly materialName: string;
  readonly spec: string | null;
  readonly unit: string;
  readonly quantity: number;
}

export interface Receipt {
  readonly id: number;
  readonly receiptNo: string;
  readonly orderId: number;
  readonly orderNo: string;
  readonly supplierName: string | null;
  readonly receivedById: string;
  readonly receivedByName: string | null;
  readonly receivedAt: string | null;
  readonly remark: string | null;
  readonly items: readonly ReceiptItem[];
  readonly createdAt: string | null;
}

export interface Attachment {
  readonly id: number;
  readonly fileId: string;
  readonly targetType: AttachmentTargetType;
  readonly targetId: number;
  readonly category: AttachmentCategory;
  readonly uploadedById: string;
  readonly uploadedByName: string | null;
  readonly createdAt: string | null;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contentUrl: string;
  readonly canWrite: boolean;
}

export interface Dashboard {
  readonly orderCount: number;
  readonly pendingApproval: number;
  readonly pendingReceipt: number;
  readonly approvedCount: number;
  readonly receiptCount: number;
  readonly totalPurchaseAmount: number;
  readonly supplierAmounts: readonly {
    readonly supplierId: number;
    readonly supplierName: string;
    readonly amount: number;
  }[];
  readonly recentOrders: readonly {
    readonly id: number;
    readonly orderNo: string;
    readonly supplierName: string | null;
    readonly status: OrderStatus;
    readonly totalAmount: number;
    readonly receiptStatus: ReceiptStatus;
    readonly createdAt: string | null;
  }[];
}

export function errorCode(error: unknown): string | undefined {
  return error instanceof ApiClientError ? error.code : undefined;
}

export function errorDetails(
  error: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (!(error instanceof ApiClientError)) return undefined;
  const payload = error.payload;
  if (!payload || typeof payload !== 'object') return undefined;
  const details = (payload as { details?: unknown }).details;
  return details && typeof details === 'object'
    ? (details as Record<string, unknown>)
    : undefined;
}

export async function getPrincipal(api: ApiClient): Promise<Principal> {
  const { data } = await api.request<{ data: Principal }>({
    path: 'procurement/me',
  });
  return data;
}

export async function getDashboard(api: ApiClient): Promise<Dashboard> {
  const { data } = await api.request<{ data: Dashboard }>({
    path: 'procurement/dashboard',
  });
  return data;
}

export async function listSuppliers(api: ApiClient): Promise<Supplier[]> {
  const { data } = await api.request<{ data: Supplier[] }>({
    path: 'procurement/suppliers',
  });
  return data;
}

export async function createSupplier(
  api: ApiClient,
  values: Record<string, unknown>,
): Promise<Supplier> {
  const { data } = await api.request<{ data: Supplier }>({
    path: 'procurement/suppliers',
    method: 'POST',
    json: values,
  });
  return data;
}

export async function updateSupplier(
  api: ApiClient,
  id: number,
  values: Record<string, unknown>,
): Promise<Supplier> {
  const { data } = await api.request<{ data: Supplier }>({
    path: `procurement/suppliers/${id}`,
    method: 'PATCH',
    json: values,
  });
  return data;
}

export async function listMaterials(api: ApiClient): Promise<Material[]> {
  const { data } = await api.request<{ data: Material[] }>({
    path: 'procurement/materials',
  });
  return data;
}

export async function createMaterial(
  api: ApiClient,
  values: Record<string, unknown>,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }>({
    path: 'procurement/materials',
    method: 'POST',
    json: values,
  });
  return data;
}

export async function updateMaterial(
  api: ApiClient,
  id: number,
  values: Record<string, unknown>,
): Promise<Material> {
  const { data } = await api.request<{ data: Material }>({
    path: `procurement/materials/${id}`,
    method: 'PATCH',
    json: values,
  });
  return data;
}

export interface OrderItemInput {
  readonly materialId: number;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly expectedDate?: string | null;
  readonly remark?: string | null;
}

export interface OrderInput {
  readonly supplierId: number;
  readonly remark?: string | null;
  readonly items: readonly OrderItemInput[];
}

export async function listOrders(
  api: ApiClient,
  query: { status?: string; scope?: string } = {},
): Promise<Order[]> {
  const { data } = await api.request<{ data: Order[] }>({
    path: 'procurement/orders',
    query: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.scope ? { scope: query.scope } : {}),
    },
  });
  return data;
}

export async function listTodoOrders(api: ApiClient): Promise<Order[]> {
  const { data } = await api.request<{ data: Order[] }>({
    path: 'procurement/orders/todos',
  });
  return data;
}

export async function getOrder(api: ApiClient, id: number): Promise<Order> {
  const { data } = await api.request<{ data: Order }>({
    path: `procurement/orders/${id}`,
  });
  return data;
}

export async function createOrder(
  api: ApiClient,
  input: OrderInput,
): Promise<Order> {
  const { data } = await api.request<{ data: Order }>({
    path: 'procurement/orders',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateOrder(
  api: ApiClient,
  id: number,
  input: OrderInput,
): Promise<Order> {
  const { data } = await api.request<{ data: Order }>({
    path: `procurement/orders/${id}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function submitOrder(api: ApiClient, id: number): Promise<Order> {
  const { data } = await api.request<{ data: Order }>({
    path: `procurement/orders/${id}/submit`,
    method: 'POST',
  });
  return data;
}

export async function approveOrder(api: ApiClient, id: number): Promise<Order> {
  const { data } = await api.request<{ data: Order }>({
    path: `procurement/orders/${id}/approve`,
    method: 'POST',
  });
  return data;
}

export async function rejectOrder(
  api: ApiClient,
  id: number,
  reason: string,
): Promise<Order> {
  const { data } = await api.request<{ data: Order }>({
    path: `procurement/orders/${id}/reject`,
    method: 'POST',
    json: { reason },
  });
  return data;
}

export async function listReceipts(api: ApiClient): Promise<Receipt[]> {
  const { data } = await api.request<{ data: Receipt[] }>({
    path: 'procurement/receipts',
  });
  return data;
}

export interface ReceiptInput {
  readonly receivedAt?: string | null;
  readonly remark?: string | null;
  readonly requestId?: string | null;
  readonly items: readonly { orderItemId: number; quantity: number }[];
}

export async function createReceipt(
  api: ApiClient,
  orderId: number,
  input: ReceiptInput,
): Promise<{ receipt: Receipt; duplicate: boolean }> {
  const { data } = await api.request<{
    data: { receipt: Receipt; duplicate: boolean };
  }>({
    path: `procurement/orders/${orderId}/receipts`,
    method: 'POST',
    json: input,
  });
  return data;
}

export interface AttachmentList {
  readonly items: readonly Attachment[];
  readonly canWrite: boolean;
}

export async function listAttachments(
  api: ApiClient,
  targetType: AttachmentTargetType,
  targetId: number,
): Promise<AttachmentList> {
  const { data } = await api.request<{ data: AttachmentList }>({
    path: 'procurement/attachments',
    query: { targetType, targetId },
  });
  return data;
}

export async function attachFiles(
  api: ApiClient,
  input: {
    targetType: AttachmentTargetType;
    targetId: number;
    category: AttachmentCategory;
    fileIds: readonly string[];
  },
): Promise<AttachmentList> {
  const { data } = await api.request<{ data: AttachmentList }>({
    path: 'procurement/attachments',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function removeAttachment(
  api: ApiClient,
  id: number,
): Promise<void> {
  await api.request({
    path: `procurement/attachments/${id}`,
    method: 'DELETE',
  });
}
