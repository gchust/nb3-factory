import {
  apiClientToken,
  useService,
  type ApiClient,
  type ApiRequestOptions,
} from '@nocobase/app-client';
import { useMemo } from 'react';

/** Browser-side shapes of the retail API. They mirror the server DTOs. */

export type ProductCategory = 'food' | 'household' | 'clothing';
export type ProductStatus = 'on_sale' | 'off_shelf';
export type PaymentMethod = 'cash' | 'wechat' | 'alipay';

export interface RetailProduct {
  readonly id: number;
  readonly name: string;
  readonly barcode: string;
  readonly category: string;
  readonly price: number;
  readonly cost?: number;
  readonly stock: number;
  readonly status: string;
  readonly images: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RetailOrderItem {
  readonly id: number;
  readonly orderId: number;
  readonly productId: number;
  readonly productName: string;
  readonly barcode: string | null;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly subtotal: number;
}

export interface RetailOrder {
  readonly id: number;
  readonly orderNumber: string;
  readonly storeName: string;
  readonly cashierId: string;
  readonly cashierName: string;
  readonly originalAmount: number;
  readonly discountPercent: number;
  readonly discountAmount: number;
  readonly payableAmount: number;
  readonly paymentMethod: string;
  readonly status: string;
  readonly soldAt: string;
  readonly returnedAt: string | null;
  readonly items: readonly RetailOrderItem[];
}

export interface RetailPurchase {
  readonly id: number;
  readonly productId: number;
  readonly productName: string;
  readonly quantity: number;
  readonly unitCost: number;
  readonly supplier: string | null;
  readonly purchaseDate: string;
  readonly createdByName: string | null;
}

export interface RetailPaymentTotal {
  readonly paymentMethod: string;
  readonly amount: number;
  readonly count: number;
}

export interface RetailRankingEntry {
  readonly productId: number;
  readonly productName: string;
  readonly quantity: number;
  readonly amount: number;
}

export interface RetailDailyReport {
  readonly date: string;
  readonly orderCount: number;
  readonly payableTotal: number;
  readonly originalTotal: number;
  readonly discountTotal: number;
  readonly byPayment: readonly RetailPaymentTotal[];
  readonly ranking: readonly RetailRankingEntry[];
}

export interface RetailAccess {
  readonly createOrder: boolean;
  readonly manageProducts: boolean;
  readonly registerPurchase: boolean;
  readonly returnOrder: boolean;
  /** Page-level access to the sales orders page, which a viewer does not have. */
  readonly viewSales: boolean;
  readonly viewReports: boolean;
}

export interface ProductQuery {
  readonly category?: string;
  readonly status?: string;
  readonly search?: string;
  readonly onSaleOnly?: boolean;
}

export interface ProductInput {
  readonly name: string;
  readonly barcode: string;
  readonly category: ProductCategory;
  readonly price: number;
  readonly cost: number;
  readonly stock: number;
  readonly status: ProductStatus;
  readonly images: readonly string[];
}

export interface CartLine {
  readonly productId: number;
  readonly quantity: number;
}

export interface CreateOrderInput {
  readonly paymentMethod: PaymentMethod;
  readonly discountPercent: number;
  readonly items: readonly CartLine[];
}

export interface PurchaseInput {
  readonly productId: number;
  readonly quantity: number;
  readonly unitCost: number;
  readonly supplier?: string;
  readonly purchaseDate?: string;
}

export interface RetailApi {
  access(): Promise<RetailAccess>;
  listProducts(query?: ProductQuery): Promise<RetailProduct[]>;
  listManagedProducts(query?: ProductQuery): Promise<RetailProduct[]>;
  createProduct(input: ProductInput): Promise<{ id: number }>;
  updateProduct(
    id: number,
    input: Partial<ProductInput>,
  ): Promise<{ id: number }>;
  listOrders(query?: { from?: string; to?: string }): Promise<RetailOrder[]>;
  createOrder(input: CreateOrderInput): Promise<{
    id: number;
    orderNumber: string;
    originalAmount: number;
    discountAmount: number;
    payableAmount: number;
  }>;
  returnOrder(id: number): Promise<{ id: number; returnedAt: string }>;
  listPurchases(): Promise<RetailPurchase[]>;
  createPurchase(input: PurchaseInput): Promise<{ id: number; stock: number }>;
  dailyReport(date?: string): Promise<RetailDailyReport>;
}

export function createRetailApi(api: ApiClient): RetailApi {
  const call = async <T>(options: ApiRequestOptions): Promise<T> => {
    const response = await api.request<Envelope<T>>(options);
    return response.data;
  };

  const query = (
    input: ProductQuery = {},
  ): Record<string, string | boolean> => {
    const result: Record<string, string | boolean> = {};
    if (input.category) result.category = input.category;
    if (input.status) result.status = input.status;
    if (input.search) result.search = input.search;
    if (input.onSaleOnly) result.onSaleOnly = true;
    return result;
  };

  return {
    access: () => call<RetailAccess>({ path: 'retail/access' }),
    listProducts: (input) =>
      call<RetailProduct[]>({
        path: 'retail/products',
        query: query(input),
      }),
    listManagedProducts: (input) =>
      call<RetailProduct[]>({
        path: 'retail/products/manage',
        query: query(input),
      }),
    createProduct: (input) =>
      call<{ id: number }>({
        path: 'retail/products',
        method: 'POST',
        json: input,
      }),
    updateProduct: (id, input) =>
      call<{ id: number }>({
        path: `retail/products/${id}`,
        method: 'PATCH',
        json: input,
      }),
    listOrders: (input = {}) =>
      call<RetailOrder[]>({
        path: 'retail/sales-orders',
        query: {
          ...(input.from ? { from: input.from } : {}),
          ...(input.to ? { to: input.to } : {}),
        },
      }),
    createOrder: (input) =>
      call<{
        id: number;
        orderNumber: string;
        originalAmount: number;
        discountAmount: number;
        payableAmount: number;
      }>({ path: 'retail/sales-orders', method: 'POST', json: input }),
    returnOrder: (id) =>
      call<{ id: number; returnedAt: string }>({
        path: `retail/sales-orders/${id}/return`,
        method: 'POST',
      }),
    listPurchases: () => call<RetailPurchase[]>({ path: 'retail/purchases' }),
    createPurchase: (input) =>
      call<{ id: number; stock: number }>({
        path: 'retail/purchases',
        method: 'POST',
        json: input,
      }),
    dailyReport: (date) =>
      call<RetailDailyReport>({
        path: 'retail/reports/daily',
        query: date ? { date } : {},
      }),
  };
}

export function useRetailApi(): RetailApi {
  const api = useService(apiClientToken);
  return useMemo(() => createRetailApi(api), [api]);
}

interface Envelope<T> {
  readonly data: T;
}

export interface RetailErrorInfo {
  readonly code?: string;
  readonly message?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Reads a stable error code and details from an API failure without depending on its class. */
export function readRetailError(error: unknown): RetailErrorInfo {
  if (!error || typeof error !== 'object') return {};
  const record = error as {
    code?: unknown;
    payload?: unknown;
  };
  const payload =
    record.payload && typeof record.payload === 'object'
      ? (record.payload as Record<string, unknown>)
      : undefined;
  const code =
    typeof record.code === 'string'
      ? record.code
      : typeof payload?.code === 'string'
        ? payload.code
        : undefined;
  return {
    ...(code ? { code } : {}),
    ...(typeof payload?.message === 'string'
      ? { message: payload.message }
      : {}),
    ...(payload?.details && typeof payload.details === 'object'
      ? { details: payload.details as Record<string, unknown> }
      : {}),
  };
}

/** Maps a stable error code to a translation key under the `retail` namespace. */
export function retailErrorKey(code: string | undefined): string {
  switch (code) {
    case 'INSUFFICIENT_STOCK':
      return 'retail.errors.insufficientStock';
    case 'VALIDATION_ERROR':
      return 'retail.errors.validation';
    case 'INVALID_STATE':
      return 'retail.errors.invalidState';
    case 'NOT_FOUND':
      return 'retail.errors.notFound';
    case 'AUTHORIZATION_DENIED':
      return 'retail.errors.forbidden';
    default:
      return 'retail.errors.generic';
  }
}
