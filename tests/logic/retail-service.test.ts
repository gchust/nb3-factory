import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RetailService } from '../../server/providers/retail/service.js';
import type { ProductInput } from '../../server/providers/retail/types.js';
import { createRetailTestDatabase } from '../support/retail-db.js';

const CASHIER = { id: 'cashier-1', name: 'Cashier One' };
const MANAGER = { id: 'manager-1', name: 'Manager One' };

function conditions(action: string): DatabaseAuthorizationConditions {
  return {
    type: 'database',
    collection: 'main.retail',
    action,
    filter: { $and: [] },
    fields: { input: '*', output: '*' },
  };
}

function product(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: 'Cola',
    barcode: `BAR-${Math.random().toString(36).slice(2, 10)}`,
    category: 'food',
    price: 10.5,
    cost: 6,
    stock: 10,
    status: 'on_sale',
    ...overrides,
  };
}

describe('RetailService', () => {
  let manager: DatabaseManager;
  let service: RetailService;

  beforeAll(async () => {
    manager = await createRetailTestDatabase();
    service = new RetailService(manager);
  });

  afterAll(async () => {
    await manager.destroy();
  });

  async function createProduct(input: ProductInput): Promise<number> {
    const created = await service.createProduct(input, conditions('create'));
    return created.id;
  }

  it('computes each line, the total, the discount and the payable amount server-side', async () => {
    const productA = await createProduct(
      product({ name: 'Coffee', price: 10.5, stock: 10 }),
    );
    const productB = await createProduct(
      product({ name: 'Tea', price: 3.25, stock: 10 }),
    );

    const order = await service.createOrder(
      {
        paymentMethod: 'cash',
        discountPercent: 10,
        items: [
          { productId: productA, quantity: 2 },
          { productId: productB, quantity: 3 },
        ],
      },
      CASHIER,
      conditions('create'),
      conditions('create'),
    );

    // 10.5 * 2 + 3.25 * 3 = 30.75; 10% = 3.08; payable = 27.67
    expect(order.originalAmount).toBeCloseTo(30.75);
    expect(order.discountAmount).toBeCloseTo(3.08);
    expect(order.payableAmount).toBeCloseTo(27.67);

    const orders = await service.listOrders({}, conditions('read'));
    const stored = orders.find((entry) => entry.id === order.id);
    expect(stored?.items).toHaveLength(2);
    const coffee = stored?.items.find((item) => item.productId === productA);
    expect(coffee?.quantity).toBe(2);
    expect(coffee?.subtotal).toBeCloseTo(21);
  });

  it('decrements stock after checkout', async () => {
    const productId = await createProduct(
      product({ name: 'Milk', price: 4, stock: 8 }),
    );

    await service.createOrder(
      {
        paymentMethod: 'wechat',
        discountPercent: 0,
        items: [{ productId, quantity: 5 }],
      },
      CASHIER,
      conditions('create'),
      conditions('create'),
    );

    const products = await service.listProducts({}, conditions('read'));
    expect(products.find((entry) => entry.id === productId)?.stock).toBe(3);
  });

  it('rejects a checkout that exceeds stock and leaves stock untouched', async () => {
    const productId = await createProduct(
      product({ name: 'Juice', price: 5, stock: 1 }),
    );

    await expect(
      service.createOrder(
        {
          paymentMethod: 'alipay',
          discountPercent: 0,
          items: [{ productId, quantity: 2 }],
        },
        CASHIER,
        conditions('create'),
        conditions('create'),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', status: 409 });

    const products = await service.listProducts({}, conditions('read'));
    expect(products.find((entry) => entry.id === productId)?.stock).toBe(1);
  });

  it('restores stock and marks the order returned on a whole-order return', async () => {
    const productId = await createProduct(
      product({ name: 'Water', price: 2, stock: 6 }),
    );

    const order = await service.createOrder(
      {
        paymentMethod: 'cash',
        discountPercent: 0,
        items: [{ productId, quantity: 4 }],
      },
      CASHIER,
      conditions('create'),
      conditions('create'),
    );

    let products = await service.listProducts({}, conditions('read'));
    expect(products.find((entry) => entry.id === productId)?.stock).toBe(2);

    await service.returnOrder(
      order.id,
      conditions('update'),
      conditions('update'),
    );

    products = await service.listProducts({}, conditions('read'));
    expect(products.find((entry) => entry.id === productId)?.stock).toBe(6);

    const orders = await service.listOrders({}, conditions('read'));
    expect(orders.find((entry) => entry.id === order.id)?.status).toBe(
      'returned',
    );
  });

  it('filters the product list by category', async () => {
    await createProduct(
      product({ name: 'Shirt', category: 'clothing', barcode: 'CLOTH-1' }),
    );

    const clothing = await service.listProducts(
      { category: 'clothing' },
      conditions('read'),
    );
    expect(clothing.length).toBeGreaterThan(0);
    expect(clothing.every((entry) => entry.category === 'clothing')).toBe(true);
  });

  it('increases stock when a purchase is registered', async () => {
    const productId = await createProduct(
      product({ name: 'Soap', price: 7, stock: 3 }),
    );

    await service.createPurchase(
      { productId, quantity: 12, unitCost: 4.5, supplier: 'Supplier A' },
      MANAGER,
      conditions('create'),
      conditions('update'),
    );

    const products = await service.listProducts({}, conditions('read'));
    expect(products.find((entry) => entry.id === productId)?.stock).toBe(15);

    const purchases = await service.listPurchases(conditions('read'));
    expect(purchases[0]?.quantity).toBe(12);
    expect(purchases[0]?.supplier).toBe('Supplier A');
  });

  it('reports the day, with payment totals that add up to the payable total', async () => {
    const productId = await createProduct(
      product({ name: 'Bread', price: 12.5, stock: 20 }),
    );

    const order = await service.createOrder(
      {
        paymentMethod: 'wechat',
        discountPercent: 10,
        items: [{ productId, quantity: 2 }],
      },
      CASHIER,
      conditions('create'),
      conditions('create'),
    );

    const report = await service.dailyReport(undefined, conditions('read'));
    expect(report.orderCount).toBeGreaterThanOrEqual(1);
    expect(report.payableTotal).toBeGreaterThanOrEqual(order.payableAmount);

    const paymentSum = report.byPayment.reduce(
      (total, entry) => total + entry.amount,
      0,
    );
    expect(paymentSum).toBeCloseTo(report.payableTotal, 2);

    const entry = report.byPayment.find(
      (item) => item.paymentMethod === 'wechat',
    );
    expect(entry?.amount).toBeGreaterThanOrEqual(order.payableAmount);

    const rank = report.ranking.find((item) => item.productId === productId);
    expect(rank?.quantity).toBe(2);
  });
});
