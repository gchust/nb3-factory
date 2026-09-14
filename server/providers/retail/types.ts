/** Shared domain types for the retail store module. */

export type ProductCategory = 'food' | 'household' | 'clothing';

export type ProductStatus = 'on_sale' | 'off_shelf';

export type PaymentMethod = 'cash' | 'wechat' | 'alipay';

export type OrderStatus = 'completed' | 'returned';

export const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  'food',
  'household',
  'clothing',
];

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'cash',
  'wechat',
  'alipay',
];

export interface ProductInput {
  readonly name: string;
  readonly barcode: string;
  readonly category: ProductCategory;
  readonly price: number;
  readonly cost: number;
  readonly stock: number;
  readonly status: ProductStatus;
  readonly images?: readonly string[];
}

export interface ProductListFilters {
  readonly category?: ProductCategory;
  readonly status?: ProductStatus;
  readonly search?: string;
  readonly onSaleOnly?: boolean;
}

export interface ProductRecord {
  readonly id: number;
  readonly name: string;
  readonly barcode: string;
  readonly category: string;
  readonly price: number;
  /** Present only when the caller is authorized to read the cost price. */
  readonly cost?: number;
  readonly stock: number;
  readonly status: string;
  readonly images: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CartItemInput {
  readonly productId: number;
  readonly quantity: number;
}

export interface CreateOrderInput {
  readonly storeName?: string;
  readonly paymentMethod: PaymentMethod;
  readonly discountPercent: number;
  readonly items: readonly CartItemInput[];
}

export interface OrderItemRecord {
  readonly id: number;
  readonly orderId: number;
  readonly productId: number;
  readonly productName: string;
  readonly barcode: string | null;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly subtotal: number;
}

export interface SalesOrderRecord {
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
  readonly createdAt: string;
  readonly items: readonly OrderItemRecord[];
}

export interface OrderListFilters {
  readonly from?: string;
  readonly to?: string;
  readonly status?: OrderStatus;
  readonly limit?: number;
}

export interface PurchaseInput {
  readonly productId: number;
  readonly quantity: number;
  readonly unitCost: number;
  readonly supplier?: string;
  readonly purchaseDate?: string;
}

export interface PurchaseRecord {
  readonly id: number;
  readonly productId: number;
  readonly productName: string;
  readonly quantity: number;
  readonly unitCost: number;
  readonly supplier: string | null;
  readonly purchaseDate: string;
  readonly createdById: string;
  readonly createdByName: string | null;
  readonly createdAt: string;
}

export interface DailyReportPaymentTotal {
  readonly paymentMethod: string;
  readonly amount: number;
  readonly count: number;
}

export interface DailyReportRankingEntry {
  readonly productId: number;
  readonly productName: string;
  readonly quantity: number;
  readonly amount: number;
}

export interface DailyReport {
  readonly date: string;
  readonly orderCount: number;
  readonly payableTotal: number;
  readonly originalTotal: number;
  readonly discountTotal: number;
  readonly byPayment: readonly DailyReportPaymentTotal[];
  readonly ranking: readonly DailyReportRankingEntry[];
}

export interface OrderPrincipal {
  readonly id: string;
  readonly name: string;
}

export const RETAIL_ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'INSUFFICIENT_STOCK',
  'INVALID_STATE',
  'AUTHORIZATION_DENIED',
] as const;

export type RetailErrorCode = (typeof RETAIL_ERROR_CODES)[number];

/** A domain failure the route turns into a stable error code and HTTP status. */
export class RetailError extends Error {
  public readonly code: RetailErrorCode;
  public readonly status: number;
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(
    code: RetailErrorCode,
    message: string,
    status: number,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'RetailError';
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}
