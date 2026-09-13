import {
  apiClientToken,
  resolveAppUrl,
  useService,
} from '@nocobase/app-client';
import type { ApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type SupplierCategory = 'material' | 'service' | 'engineering';
export type SupplierStatus = 'active' | 'disabled';
export type RequestStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type OrderStatus = 'ordered' | 'partial' | 'received';

export interface ProcurementCapabilities {
  readonly roles: readonly string[];
  readonly isAdministrator: boolean;
  readonly canApprove: boolean;
  readonly manageSuppliers: boolean;
  readonly manageOrders: boolean;
  readonly viewAllRequests: boolean;
}

export interface CurrentUser {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProcurementCapabilities;
}

export interface ProcurementAttachment {
  readonly id: number;
  readonly ownerType: string;
  readonly ownerId: string;
  readonly fileId: string;
  readonly filename: string | null;
  readonly contentUrl: string;
}

export interface Supplier {
  readonly id: number;
  readonly name: string;
  readonly unifiedSocialCreditCode: string | null;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly category: SupplierCategory;
  readonly status: SupplierStatus;
  readonly files: readonly ProcurementAttachment[];
  readonly createdAt: string;
}

export interface SupplierInput {
  readonly name: string;
  readonly unifiedSocialCreditCode: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly category: SupplierCategory;
  readonly status: SupplierStatus;
}

export interface RequestItem {
  readonly id: number;
  readonly materialName: string;
  readonly specification: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
}

export interface RequestItemInput {
  readonly materialName: string;
  readonly specification: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface PurchaseRequest {
  readonly id: number;
  readonly applicantId: string;
  readonly applicantName: string | null;
  readonly department: string | null;
  readonly description: string | null;
  readonly expectedDate: string | null;
  readonly status: RequestStatus;
  readonly rejectReason: string | null;
  readonly totalAmount: number;
  readonly submittedAt: string | null;
  readonly approvedAt: string | null;
  readonly items: readonly RequestItem[];
  readonly files: readonly ProcurementAttachment[];
  readonly createdAt: string;
}

export interface RequestInput {
  readonly department: string;
  readonly description: string;
  readonly expectedDate: string;
  readonly items: readonly RequestItemInput[];
}

export interface PurchaseReceipt {
  readonly id: number;
  readonly orderId: number;
  readonly quantity: number;
  readonly receivedDate: string;
  readonly createdAt: string;
}

export interface PurchaseOrder {
  readonly id: number;
  readonly orderNumber: string;
  readonly requestId: number | null;
  readonly supplierId: number;
  readonly supplierName: string | null;
  readonly amount: number;
  readonly totalQuantity: number;
  readonly receivedQuantity: number;
  readonly orderDate: string;
  readonly status: OrderStatus;
  readonly receipts: readonly PurchaseReceipt[];
  readonly createdAt: string;
}

export interface ProcurementStatistics {
  readonly pendingApprovalCount: number;
  readonly bySupplier: readonly {
    supplierId: number;
    supplierName: string;
    total: number;
  }[];
  readonly byMonth: readonly { month: string; total: number }[];
}

export class ProcurementApiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ProcurementApiError';
    this.code = code;
    this.status = status;
  }
}

export interface ProcurementApi {
  me(): Promise<CurrentUser>;
  register(input: {
    name: string;
    username: string;
    email: string;
    password: string;
  }): Promise<{ id: string; name: string; username: string; email: string }>;
  listSuppliers(filter: {
    category?: string;
    search?: string;
  }): Promise<Supplier[]>;
  createSupplier(input: SupplierInput): Promise<Supplier>;
  updateSupplier(id: number, input: SupplierInput): Promise<Supplier>;
  listRequests(): Promise<PurchaseRequest[]>;
  getRequest(id: number): Promise<PurchaseRequest>;
  createRequest(input: RequestInput): Promise<PurchaseRequest>;
  updateRequest(id: number, input: RequestInput): Promise<PurchaseRequest>;
  submitRequest(id: number): Promise<PurchaseRequest>;
  approveRequest(id: number): Promise<PurchaseRequest>;
  rejectRequest(id: number, reason: string): Promise<PurchaseRequest>;
  listOrders(): Promise<PurchaseOrder[]>;
  getOrder(id: number): Promise<PurchaseOrder>;
  createOrder(input: {
    requestId: number;
    supplierId: number;
    orderDate: string;
  }): Promise<PurchaseOrder>;
  createReceipt(
    orderId: number,
    input: { quantity: number; receivedDate: string },
  ): Promise<PurchaseOrder>;
  uploadAttachment(
    ownerType: 'supplier' | 'request',
    ownerId: number,
    file: File,
  ): Promise<ProcurementAttachment>;
  statistics(): Promise<ProcurementStatistics>;
}

export function attachmentUrl(contentUrl: string): string {
  return resolveAppUrl(contentUrl);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

export function createProcurementApi(api: ApiClient): ProcurementApi {
  const request = async <T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH';
      json?: unknown;
      query?: Record<string, string | undefined>;
    } = {},
  ): Promise<T> => {
    try {
      const response = await api.request<{ data: T }>({
        path,
        method: options.method ?? 'GET',
        ...(options.json === undefined ? {} : { json: options.json }),
        ...(options.query ? { query: options.query } : {}),
      });
      return response.data;
    } catch (cause) {
      throw toProcurementError(cause);
    }
  };

  return {
    me: () => request<CurrentUser>('procurement/me'),
    register: (input) =>
      request<{ id: string; name: string; username: string; email: string }>(
        'procurement/register',
        { method: 'POST', json: input },
      ),
    listSuppliers: (filter) =>
      request<Supplier[]>('procurement/suppliers', {
        query: { category: filter.category, search: filter.search },
      }),
    createSupplier: (input) =>
      request<Supplier>('procurement/suppliers', {
        method: 'POST',
        json: input,
      }),
    updateSupplier: (id, input) =>
      request<Supplier>(`procurement/suppliers/${id}`, {
        method: 'PATCH',
        json: input,
      }),
    listRequests: () => request<PurchaseRequest[]>('procurement/requests'),
    getRequest: (id) => request<PurchaseRequest>(`procurement/requests/${id}`),
    createRequest: (input) =>
      request<PurchaseRequest>('procurement/requests', {
        method: 'POST',
        json: input,
      }),
    updateRequest: (id, input) =>
      request<PurchaseRequest>(`procurement/requests/${id}`, {
        method: 'PATCH',
        json: input,
      }),
    submitRequest: (id) =>
      request<PurchaseRequest>(`procurement/requests/${id}/submit`, {
        method: 'POST',
      }),
    approveRequest: (id) =>
      request<PurchaseRequest>(`procurement/requests/${id}/approve`, {
        method: 'POST',
      }),
    rejectRequest: (id, reason) =>
      request<PurchaseRequest>(`procurement/requests/${id}/reject`, {
        method: 'POST',
        json: { reason },
      }),
    listOrders: () => request<PurchaseOrder[]>('procurement/orders'),
    getOrder: (id) => request<PurchaseOrder>(`procurement/orders/${id}`),
    createOrder: (input) =>
      request<PurchaseOrder>('procurement/orders', {
        method: 'POST',
        json: input,
      }),
    createReceipt: (orderId, input) =>
      request<PurchaseOrder>(`procurement/orders/${orderId}/receipts`, {
        method: 'POST',
        json: input,
      }),
    uploadAttachment: async (ownerType, ownerId, file) => {
      const form = new FormData();
      form.append('file', file);
      form.append('ownerType', ownerType);
      form.append('ownerId', String(ownerId));
      try {
        const response = await api.request<{ data: ProcurementAttachment }>({
          path: 'procurement/attachments',
          method: 'POST',
          body: form,
        });
        return response.data;
      } catch (cause) {
        throw toProcurementError(cause);
      }
    },
    statistics: () => request<ProcurementStatistics>('procurement/statistics'),
  };
}

export function useProcurementApi(): ProcurementApi {
  const api = useService(apiClientToken);
  return useMemo(() => createProcurementApi(api), [api]);
}

export interface Loaded<T> {
  readonly data: T | undefined;
  readonly error: string | undefined;
  readonly loading: boolean;
  readonly reload: () => void;
}

/** Runs an async loader and exposes loading, error and a manual reload. */
export function useLoaded<T>(loader: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<{
    readonly loader: (() => Promise<T>) | undefined;
    readonly data?: T;
    readonly error?: string;
  }>({ loader: undefined });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    loader().then(
      (value) => {
        if (active) setState({ loader, data: value });
      },
      (cause: unknown) => {
        if (active) setState({ loader, error: messageOf(cause) });
      },
    );
    return () => {
      active = false;
    };
  }, [loader, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  // State produced by a previous loader is stale until the current one settles.
  const current = state.loader === loader;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: !current,
    reload,
  };
}

function toProcurementError(cause: unknown): ProcurementApiError {
  const candidate = cause as {
    status?: number;
    code?: string;
    message?: string;
    body?: unknown;
  };
  const status = typeof candidate?.status === 'number' ? candidate.status : 0;
  const body = candidate?.body as
    { code?: string; message?: string } | undefined;
  return new ProcurementApiError(
    body?.code ?? candidate?.code ?? 'REQUEST_FAILED',
    body?.message ?? candidate?.message ?? 'Request failed.',
    status,
  );
}
