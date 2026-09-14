import type {
  DatabaseAuthorizationConditions,
  DatabaseFilter,
} from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';

import { compileAuthorizationFilter } from './filter.js';
import {
  PAYMENT_METHODS,
  PRODUCT_CATEGORIES,
  RetailError,
  type CreateOrderInput,
  type DailyReport,
  type DailyReportPaymentTotal,
  type DailyReportRankingEntry,
  type OrderItemRecord,
  type OrderListFilters,
  type OrderPrincipal,
  type ProductCategory,
  type ProductInput,
  type ProductListFilters,
  type ProductRecord,
  type ProductStatus,
  type PurchaseInput,
  type PurchaseRecord,
  type SalesOrderRecord,
} from './types.js';

const PRODUCT_FIELDS = [
  'id',
  'name',
  'barcode',
  'category',
  'price',
  'cost',
  'stock',
  'status',
  'images',
  'createdAt',
  'updatedAt',
] as const;

const ORDER_FIELDS = [
  'id',
  'orderNumber',
  'storeName',
  'cashierId',
  'cashierName',
  'originalAmount',
  'discountPercent',
  'discountAmount',
  'payableAmount',
  'paymentMethod',
  'status',
  'soldAt',
  'returnedAt',
  'createdAt',
] as const;

const ITEM_FIELDS = [
  'id',
  'orderId',
  'productId',
  'productName',
  'barcode',
  'unitPrice',
  'quantity',
  'subtotal',
] as const;

const PURCHASE_FIELDS = [
  'id',
  'productId',
  'productName',
  'quantity',
  'unitCost',
  'supplier',
  'purchaseDate',
  'createdById',
  'createdByName',
  'createdAt',
] as const;

const DEFAULT_STORE_NAME = '总店';

/** Domain logic for the retail store. Routes translate HTTP; this translates business rules. */
export class RetailService {
  public constructor(private readonly database: DatabaseManager) {}

  public async listProducts(
    filters: ProductListFilters,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ProductRecord[]> {
    const fields = selectFields(conditions.fields.output, PRODUCT_FIELDS);
    let query = this.database
      .query()
      .selectFrom('retailProducts')
      .select(fields)
      .where((eb) => compileAuthorizationFilter(eb, conditions.filter));

    if (filters.category) {
      query = query.where('category', '=', filters.category);
    }
    if (filters.status) {
      query = query.where('status', '=', filters.status);
    } else if (filters.onSaleOnly) {
      query = query.where('status', '=', 'on_sale');
    }
    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      query = query.where((eb) =>
        eb.or([eb('name', 'like', term), eb('barcode', 'like', term)]),
      );
    }

    const rows = await query.orderBy('name', 'asc').execute();
    return rows.map((row) => normalizeProduct(row));
  }

  public async createProduct(
    input: ProductInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number }> {
    assertAllowedInput(conditions.fields.input, [
      'name',
      'barcode',
      'category',
      'price',
      'cost',
      'stock',
      'status',
      'images',
    ]);
    const product = validateProductInput(input);
    await this.assertBarcodeAvailable(product.barcode);

    const now = new Date().toISOString();
    const result = await this.database
      .query()
      .insertInto('retailProducts')
      .values({
        ...product,
        images: product.images ? JSON.stringify(product.images) : null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    return { id: Number(result.insertId) };
  }

  public async updateProduct(
    id: number,
    input: Partial<ProductInput>,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number }> {
    assertAllowedInput(conditions.fields.input, Object.keys(input));
    const patch = validateProductPatch(input);
    if (patch.barcode) {
      await this.assertBarcodeAvailable(patch.barcode, id);
    }

    const values: Record<string, unknown> = {
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (patch.images !== undefined) {
      values.images = patch.images ? JSON.stringify(patch.images) : null;
    }

    const result = await this.database
      .query()
      .updateTable('retailProducts')
      .set(values)
      .where('id', '=', id)
      .where((eb) => compileAuthorizationFilter(eb, conditions.filter))
      .execute();

    if ((result.updatedCount ?? 0) === 0) {
      throw new RetailError(
        'NOT_FOUND',
        `Product ${id} not found or not accessible.`,
        404,
      );
    }
    return { id };
  }

  public async listOrders(
    filters: OrderListFilters,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<SalesOrderRecord[]> {
    const fields = selectFields(conditions.fields.output, ORDER_FIELDS);
    let query = this.database
      .query()
      .selectFrom('retailSalesOrders')
      .select(fields)
      .where((eb) => compileAuthorizationFilter(eb, conditions.filter));

    if (filters.from) query = query.where('soldAt', '>=', filters.from);
    if (filters.to) query = query.where('soldAt', '<', filters.to);
    if (filters.status) query = query.where('status', '=', filters.status);

    const rows = await query
      .orderBy('soldAt', 'desc')
      .limit(filters.limit ?? 100)
      .execute();
    const orders = rows.map((row) => normalizeOrder(row));
    return this.attachItems(orders);
  }

  /**
   * Checkout. Prices are read from the database, never trusted from the request, and stock is
   * decremented with a compare-and-set so two concurrent checkouts cannot oversell.
   */
  public async createOrder(
    input: CreateOrderInput,
    principal: OrderPrincipal,
    orderConditions: DatabaseAuthorizationConditions,
    itemConditions: DatabaseAuthorizationConditions,
  ): Promise<{
    id: number;
    orderNumber: string;
    originalAmount: number;
    discountAmount: number;
    payableAmount: number;
  }> {
    assertAllowedInput(orderConditions.fields.input, [
      'storeName',
      'paymentMethod',
      'discountPercent',
    ]);
    for (const item of input.items ?? []) {
      assertAllowedInput(itemConditions.fields.input, Object.keys(item));
    }

    const items = validateCart(input.items);
    const paymentMethod = requirePaymentMethod(input.paymentMethod);
    const discountPercent = requireDiscountPercent(input.discountPercent);
    const storeName =
      typeof input.storeName === 'string' && input.storeName.trim()
        ? input.storeName.trim()
        : DEFAULT_STORE_NAME;
    const orderNumber = generateOrderNumber(new Date());

    return this.database.transaction(async (connection) => {
      const now = new Date().toISOString();
      let originalCents = 0;
      const prepared: {
        productId: number;
        productName: string;
        barcode: string | null;
        unitPriceCents: number;
        quantity: number;
        subtotalCents: number;
      }[] = [];

      for (const item of items) {
        const product = await connection.query
          .selectFrom('retailProducts')
          .selectAll()
          .where('id', '=', item.productId)
          .executeTakeFirst();

        if (!product) {
          throw new RetailError(
            'VALIDATION_ERROR',
            `Unknown product: ${item.productId}`,
            400,
            { productId: item.productId },
          );
        }
        if (String(product.status) !== 'on_sale') {
          throw new RetailError(
            'INVALID_STATE',
            `Product ${item.productId} is not on sale.`,
            409,
            { productId: item.productId, productName: String(product.name) },
          );
        }

        const available = toInt(product.stock);
        if (available < item.quantity) {
          throw insufficientStock(
            item.productId,
            String(product.name),
            available,
          );
        }

        const unitPriceCents = toCents(product.price);
        const subtotalCents = unitPriceCents * item.quantity;
        originalCents += subtotalCents;

        const updated = await connection.query
          .updateTable('retailProducts')
          .set({ stock: available - item.quantity, updatedAt: now })
          .where('id', '=', item.productId)
          .where('stock', '=', available)
          .execute();
        if ((updated.updatedCount ?? 0) === 0) {
          // Another checkout changed the stock between the read and the write.
          throw insufficientStock(
            item.productId,
            String(product.name),
            available,
          );
        }

        prepared.push({
          productId: item.productId,
          productName: String(product.name),
          barcode: typeof product.barcode === 'string' ? product.barcode : null,
          unitPriceCents,
          quantity: item.quantity,
          subtotalCents,
        });
      }

      const discountCents = Math.round((originalCents * discountPercent) / 100);
      const payableCents = originalCents - discountCents;

      const inserted = await connection.query
        .insertInto('retailSalesOrders')
        .values({
          orderNumber,
          storeName,
          cashierId: principal.id,
          cashierName: principal.name,
          originalAmount: fromCents(originalCents),
          discountPercent,
          discountAmount: fromCents(discountCents),
          payableAmount: fromCents(payableCents),
          paymentMethod,
          status: 'completed',
          soldAt: now,
          returnedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const orderId = Number(inserted.insertId);

      await connection.query
        .insertInto('retailSalesOrderItems')
        .values(
          prepared.map((item) => ({
            orderId,
            productId: item.productId,
            productName: item.productName,
            barcode: item.barcode,
            unitPrice: fromCents(item.unitPriceCents),
            quantity: item.quantity,
            subtotal: fromCents(item.subtotalCents),
            createdAt: now,
          })),
        )
        .execute();

      return {
        id: orderId,
        orderNumber,
        originalAmount: fromCents(originalCents),
        discountAmount: fromCents(discountCents),
        payableAmount: fromCents(payableCents),
      };
    });
  }

  /** Whole-order return: restores the stock of every line item and marks the order returned. */
  public async returnOrder(
    id: number,
    orderConditions: DatabaseAuthorizationConditions,
    productConditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number; returnedAt: string }> {
    return this.database.transaction(async (connection) => {
      const order = await connection.query
        .selectFrom('retailSalesOrders')
        .selectAll()
        .where('id', '=', id)
        .where((eb) => compileAuthorizationFilter(eb, orderConditions.filter))
        .executeTakeFirst();

      if (!order) {
        throw new RetailError(
          'NOT_FOUND',
          `Sales order ${id} not found or not accessible.`,
          404,
        );
      }
      if (String(order.status) === 'returned') {
        throw new RetailError(
          'INVALID_STATE',
          `Sales order ${id} was already returned.`,
          409,
        );
      }

      const items = await connection.query
        .selectFrom('retailSalesOrderItems')
        .selectAll()
        .where('orderId', '=', id)
        .execute();
      const now = new Date().toISOString();

      for (const item of items) {
        const product = await connection.query
          .selectFrom('retailProducts')
          .select(['id', 'stock'])
          .where('id', '=', toInt(item.productId))
          .executeTakeFirst();
        if (!product) continue;

        await connection.query
          .updateTable('retailProducts')
          .set({
            stock: toInt(product.stock) + toInt(item.quantity),
            updatedAt: now,
          })
          .where('id', '=', toInt(item.productId))
          .where((eb) =>
            compileAuthorizationFilter(eb, productConditions.filter),
          )
          .execute();
      }

      const updated = await connection.query
        .updateTable('retailSalesOrders')
        .set({ status: 'returned', returnedAt: now, updatedAt: now })
        .where('id', '=', id)
        .where((eb) => compileAuthorizationFilter(eb, orderConditions.filter))
        .execute();
      if ((updated.updatedCount ?? 0) === 0) {
        throw new RetailError(
          'NOT_FOUND',
          `Sales order ${id} not found or not accessible.`,
          404,
        );
      }

      return { id, returnedAt: now };
    });
  }

  public async listPurchases(
    conditions: DatabaseAuthorizationConditions,
    limit = 100,
  ): Promise<PurchaseRecord[]> {
    const fields = selectFields(conditions.fields.output, PURCHASE_FIELDS);
    const rows = await this.database
      .query()
      .selectFrom('retailPurchaseOrders')
      .select(fields)
      .where((eb) => compileAuthorizationFilter(eb, conditions.filter))
      .orderBy('purchaseDate', 'desc')
      .limit(limit)
      .execute();
    return rows.map((row) => normalizePurchase(row));
  }

  /** Register a stock-in and increase the product's cumulative stock. */
  public async createPurchase(
    input: PurchaseInput,
    principal: OrderPrincipal,
    purchaseConditions: DatabaseAuthorizationConditions,
    productConditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: number; stock: number }> {
    assertAllowedInput(purchaseConditions.fields.input, [
      'productId',
      'quantity',
      'unitCost',
      'supplier',
      'purchaseDate',
    ]);

    const productId = toInt(input.productId);
    const quantity = toInt(input.quantity);
    const unitCost = toNumber(input.unitCost);
    if (productId <= 0) {
      throw new RetailError('VALIDATION_ERROR', 'Product is required.', 400, {
        field: 'productId',
      });
    }
    if (quantity <= 0) {
      throw new RetailError(
        'VALIDATION_ERROR',
        'Quantity must be a positive integer.',
        400,
        { field: 'quantity' },
      );
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new RetailError(
        'VALIDATION_ERROR',
        'Unit cost must be zero or greater.',
        400,
        { field: 'unitCost' },
      );
    }

    const purchaseDate = normalizeDate(input.purchaseDate);
    const supplier =
      typeof input.supplier === 'string' && input.supplier.trim()
        ? input.supplier.trim()
        : null;

    return this.database.transaction(async (connection) => {
      const product = await connection.query
        .selectFrom('retailProducts')
        .select(['id', 'name', 'stock'])
        .where('id', '=', productId)
        .executeTakeFirst();
      if (!product) {
        throw new RetailError(
          'VALIDATION_ERROR',
          `Unknown product: ${productId}`,
          400,
          { field: 'productId' },
        );
      }

      const now = new Date().toISOString();
      const inserted = await connection.query
        .insertInto('retailPurchaseOrders')
        .values({
          productId,
          productName: String(product.name),
          quantity,
          unitCost: fromCents(toCents(unitCost)),
          supplier,
          purchaseDate,
          createdById: principal.id,
          createdByName: principal.name,
          createdAt: now,
        })
        .execute();

      const stock = toInt(product.stock) + quantity;
      await connection.query
        .updateTable('retailProducts')
        .set({ stock, updatedAt: now })
        .where('id', '=', productId)
        .where((eb) => compileAuthorizationFilter(eb, productConditions.filter))
        .execute();

      return { id: Number(inserted.insertId), stock };
    });
  }

  public async dailyReport(
    date: string | undefined,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<DailyReport> {
    const day = normalizeDay(date);
    const range = dayRange(day);

    const orders = await this.database
      .query()
      .selectFrom('retailSalesOrders')
      .selectAll()
      .where('soldAt', '>=', range.start)
      .where('soldAt', '<', range.end)
      .where((eb) => compileAuthorizationFilter(eb, conditions.filter))
      .orderBy('soldAt', 'desc')
      .execute();

    const orderIds = orders.map((order) => toInt(order.id));
    const items = orderIds.length
      ? await this.database
          .query()
          .selectFrom('retailSalesOrderItems')
          .selectAll()
          .where('orderId', 'in', orderIds)
          .execute()
      : [];

    const byPayment = new Map<string, { amount: number; count: number }>();
    let payableCents = 0;
    let originalCents = 0;
    let discountCents = 0;

    for (const order of orders) {
      const payable = toCents(order.payableAmount);
      payableCents += payable;
      originalCents += toCents(order.originalAmount);
      discountCents += toCents(order.discountAmount);
      const method = String(order.paymentMethod);
      const entry = byPayment.get(method) ?? { amount: 0, count: 0 };
      entry.amount += payable;
      entry.count += 1;
      byPayment.set(method, entry);
    }

    const ranking = new Map<
      number,
      { productName: string; quantity: number; amountCents: number }
    >();
    for (const item of items) {
      const productId = toInt(item.productId);
      const entry = ranking.get(productId) ?? {
        productName: String(item.productName),
        quantity: 0,
        amountCents: 0,
      };
      entry.quantity += toInt(item.quantity);
      entry.amountCents += toCents(item.subtotal);
      ranking.set(productId, entry);
    }

    const paymentTotal: DailyReportPaymentTotal[] = PAYMENT_METHODS.filter(
      (method) => byPayment.has(method),
    ).map((method) => ({
      paymentMethod: method,
      amount: fromCents(byPayment.get(method)!.amount),
      count: byPayment.get(method)!.count,
    }));
    for (const [method, entry] of byPayment) {
      if (!PAYMENT_METHODS.includes(method as never)) {
        paymentTotal.push({
          paymentMethod: method,
          amount: fromCents(entry.amount),
          count: entry.count,
        });
      }
    }

    const rankingEntries: DailyReportRankingEntry[] = [...ranking.entries()]
      .map(([productId, entry]) => ({
        productId,
        productName: entry.productName,
        quantity: entry.quantity,
        amount: fromCents(entry.amountCents),
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    return {
      date: day,
      orderCount: orders.length,
      payableTotal: fromCents(payableCents),
      originalTotal: fromCents(originalCents),
      discountTotal: fromCents(discountCents),
      byPayment: paymentTotal,
      ranking: rankingEntries,
    };
  }

  private async attachItems(
    orders: readonly SalesOrderRecord[],
  ): Promise<SalesOrderRecord[]> {
    if (orders.length === 0) return [...orders];
    const ids = orders.map((order) => order.id);
    const itemRows = await this.database
      .query()
      .selectFrom('retailSalesOrderItems')
      .select([...ITEM_FIELDS])
      .where('orderId', 'in', ids)
      .orderBy('id', 'asc')
      .execute();

    const byOrder = new Map<number, OrderItemRecord[]>();
    for (const row of itemRows) {
      const item = normalizeItem(row);
      const list = byOrder.get(item.orderId) ?? [];
      list.push(item);
      byOrder.set(item.orderId, list);
    }
    return orders.map((order) => ({
      ...order,
      items: byOrder.get(order.id) ?? [],
    }));
  }

  private async assertBarcodeAvailable(
    barcode: string,
    ignoreId?: number,
  ): Promise<void> {
    let query = this.database
      .query()
      .selectFrom('retailProducts')
      .select('id')
      .where('barcode', '=', barcode);
    if (ignoreId !== undefined) query = query.where('id', '!=', ignoreId);
    const existing = await query.executeTakeFirst();
    if (existing) {
      throw new RetailError(
        'VALIDATION_ERROR',
        `Barcode ${barcode} already exists.`,
        409,
        { field: 'barcode' },
      );
    }
  }
}

function selectFields(
  allowed: '*' | readonly string[],
  all: readonly string[],
): string[] {
  if (allowed === '*') return [...all];
  const present = all.filter((field) => allowed.includes(field));
  return present.length > 0 ? present : ['id'];
}

function assertAllowedInput(
  allowed: '*' | readonly string[],
  fields: readonly string[],
): void {
  if (allowed === '*') return;
  const rejected = fields.filter((field) => !allowed.includes(field));
  if (rejected.length > 0) {
    throw new RetailError(
      'AUTHORIZATION_DENIED',
      `Input fields are not authorized: ${rejected.join(', ')}`,
      403,
      { fields: rejected },
    );
  }
}

interface ProductPatch {
  name?: string;
  barcode?: string;
  category?: ProductCategory;
  price?: number;
  cost?: number;
  stock?: number;
  status?: ProductStatus;
  images?: string[];
}

function validateProductInput(input: ProductInput): {
  name: string;
  barcode: string;
  category: ProductCategory;
  price: number;
  cost: number;
  stock: number;
  status: ProductStatus;
  images?: string[];
} {
  const patch = validateProductPatch(input);
  return {
    name: patch.name!,
    barcode: patch.barcode!,
    category: patch.category!,
    price: patch.price!,
    cost: patch.cost!,
    stock: patch.stock!,
    status: patch.status!,
    ...(patch.images !== undefined ? { images: patch.images } : {}),
  };
}

function validateProductPatch(input: Partial<ProductInput>): ProductPatch {
  const patch: ProductPatch = {};

  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim()) {
      throw new RetailError('VALIDATION_ERROR', 'Name is required.', 400, {
        field: 'name',
      });
    }
    patch.name = input.name.trim();
  }
  if (input.barcode !== undefined) {
    if (typeof input.barcode !== 'string' || !input.barcode.trim()) {
      throw new RetailError('VALIDATION_ERROR', 'Barcode is required.', 400, {
        field: 'barcode',
      });
    }
    patch.barcode = input.barcode.trim();
  }
  if (input.category !== undefined) {
    if (!PRODUCT_CATEGORIES.includes(input.category)) {
      throw new RetailError('VALIDATION_ERROR', 'Invalid category.', 400, {
        field: 'category',
      });
    }
    patch.category = input.category;
  }
  if (input.status !== undefined) {
    if (input.status !== 'on_sale' && input.status !== 'off_shelf') {
      throw new RetailError('VALIDATION_ERROR', 'Invalid status.', 400, {
        field: 'status',
      });
    }
    patch.status = input.status;
  }
  if (input.price !== undefined) {
    const price = toNumber(input.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new RetailError('VALIDATION_ERROR', 'Invalid price.', 400, {
        field: 'price',
      });
    }
    patch.price = fromCents(toCents(price));
  }
  if (input.cost !== undefined) {
    const cost = toNumber(input.cost);
    if (!Number.isFinite(cost) || cost < 0) {
      throw new RetailError('VALIDATION_ERROR', 'Invalid cost.', 400, {
        field: 'cost',
      });
    }
    patch.cost = fromCents(toCents(cost));
  }
  if (input.stock !== undefined) {
    const raw = Number(input.stock);
    if (!Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) {
      throw new RetailError('VALIDATION_ERROR', 'Invalid stock.', 400, {
        field: 'stock',
      });
    }
    patch.stock = raw;
  }
  if (input.images !== undefined) {
    const images: unknown = input.images;
    if (
      !Array.isArray(images) ||
      images.some((entry) => typeof entry !== 'string')
    ) {
      throw new RetailError('VALIDATION_ERROR', 'Invalid images.', 400, {
        field: 'images',
      });
    }
    patch.images = images.map((entry: string) => entry.trim()).filter(Boolean);
  }

  return patch;
}

function validateCart(
  items: readonly { productId: number; quantity: number }[] | undefined,
): { productId: number; quantity: number }[] {
  if (!items || items.length === 0) {
    throw new RetailError(
      'VALIDATION_ERROR',
      'A sales order needs at least one line item.',
      400,
      { field: 'items' },
    );
  }
  return items.map((item) => {
    const productId = toInt(item.productId);
    const quantity = toInt(item.quantity);
    if (productId <= 0) {
      throw new RetailError('VALIDATION_ERROR', 'Invalid product.', 400, {
        field: 'productId',
      });
    }
    if (quantity <= 0) {
      throw new RetailError(
        'VALIDATION_ERROR',
        'Quantity must be a positive integer.',
        400,
        { field: 'quantity' },
      );
    }
    return { productId, quantity };
  });
}

function requirePaymentMethod(value: unknown): string {
  if (!PAYMENT_METHODS.includes(value as never)) {
    throw new RetailError('VALIDATION_ERROR', 'Invalid payment method.', 400, {
      field: 'paymentMethod',
    });
  }
  return value as string;
}

function requireDiscountPercent(value: unknown): number {
  const percent = toNumber(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RetailError(
      'VALIDATION_ERROR',
      'Discount must be between 0 and 100 percent.',
      400,
      { field: 'discountPercent' },
    );
  }
  return fromCents(toCents(percent));
}

function insufficientStock(
  productId: number,
  productName: string,
  available: number,
): RetailError {
  return new RetailError(
    'INSUFFICIENT_STOCK',
    `Insufficient stock for ${productName}.`,
    409,
    { productId, productName, available },
  );
}

function generateOrderNumber(now: Date): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto
    .randomUUID()
    .replace(/-/g, '')
    .slice(0, 6)
    .toUpperCase();
  return `SO-${date}-${suffix}`;
}

function dayRange(date: string): { start: string; end: string } {
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Resolves a requested business day to a `YYYY-MM-DD` string in the server's local timezone. */
function normalizeDay(value: string | undefined): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function normalizeDate(value: string | undefined): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [year, month, day] = value.trim().split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function toCents(value: unknown): number {
  return Math.round(toNumber(value) * 100);
}

function fromCents(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/** Reads a text column without the object stringification `String()` would produce. */
function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function normalizeProduct(row: Record<string, unknown>): ProductRecord {
  return {
    id: toInt(row.id),
    name: asString(row.name),
    barcode: asString(row.barcode),
    category: asString(row.category),
    price: fromCents(toCents(row.price)),
    // A caller without the cost grant never selects this column, so it is omitted rather than
    // reported as a missing number.
    ...(row.cost === undefined ? {} : { cost: fromCents(toCents(row.cost)) }),
    stock: toInt(row.stock),
    status: asString(row.status),
    images: parseImages(row.images),
    createdAt: asString(row.createdAt),
    updatedAt: asString(row.updatedAt),
  };
}

function normalizeOrder(row: Record<string, unknown>): SalesOrderRecord {
  return {
    id: toInt(row.id),
    orderNumber: asString(row.orderNumber),
    storeName: asString(row.storeName),
    cashierId: asString(row.cashierId),
    cashierName: asString(row.cashierName),
    originalAmount: fromCents(toCents(row.originalAmount)),
    discountPercent: fromCents(toCents(row.discountPercent)),
    discountAmount: fromCents(toCents(row.discountAmount)),
    payableAmount: fromCents(toCents(row.payableAmount)),
    paymentMethod: asString(row.paymentMethod),
    status: asString(row.status),
    soldAt: asString(row.soldAt),
    returnedAt: row.returnedAt == null ? null : asString(row.returnedAt),
    createdAt: asString(row.createdAt),
    items: [],
  };
}

function normalizeItem(row: Record<string, unknown>): OrderItemRecord {
  return {
    id: toInt(row.id),
    orderId: toInt(row.orderId),
    productId: toInt(row.productId),
    productName: asString(row.productName),
    barcode: row.barcode == null ? null : asString(row.barcode),
    unitPrice: fromCents(toCents(row.unitPrice)),
    quantity: toInt(row.quantity),
    subtotal: fromCents(toCents(row.subtotal)),
  };
}

function normalizePurchase(row: Record<string, unknown>): PurchaseRecord {
  return {
    id: toInt(row.id),
    productId: toInt(row.productId),
    productName: asString(row.productName),
    quantity: toInt(row.quantity),
    unitCost: fromCents(toCents(row.unitCost)),
    supplier: row.supplier == null ? null : asString(row.supplier),
    purchaseDate: asString(row.purchaseDate),
    createdById: asString(row.createdById),
    createdByName:
      row.createdByName == null ? null : asString(row.createdByName),
    createdAt: asString(row.createdAt),
  };
}

function parseImages(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Re-exported so the route module can name the condition type without another import path.
export type { DatabaseAuthorizationConditions, DatabaseFilter };
