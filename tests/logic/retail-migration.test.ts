import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import retailMigration from '../../database/main/migrations/202609140001_create_retail_tables.js';

function createManager(): DatabaseManager {
  return createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: ':memory:',
        schemaManagement: 'managed',
      },
    },
    metadataStore: new InMemoryCollectionMetadataStore(),
  });
}

/**
 * Builds the migration context a migrator would pass to `up`/`down`, so the retail migration can
 * be exercised against a real database without loading the plugin migrations it does not touch.
 */
async function migrationContext(manager: DatabaseManager) {
  const connection = manager.connection();
  return {
    builder: connection.builder,
    query: connection.query,
    connection: {
      name: connection.name,
      driver: connection.driver,
      dialect: connection.dialect,
      capabilities: connection.capabilities,
      client: () => connection.client(),
    },
  } as never;
}

describe('retail tables migration', () => {
  let manager: DatabaseManager;

  beforeAll(async () => {
    manager = createManager();
    await manager.connect();
    await retailMigration.up(await migrationContext(manager));
  });

  afterAll(async () => {
    await manager.destroy();
  });

  it('creates the four retail tables with their columns', async () => {
    const now = new Date().toISOString();
    await manager
      .query()
      .insertInto('retailProducts')
      .values({
        name: 'Test product',
        barcode: 'TEST-0001',
        category: 'food',
        price: 9.5,
        cost: 4,
        stock: 5,
        status: 'on_sale',
        images: JSON.stringify(['https://example.com/a.png']),
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const product = await manager
      .query()
      .selectFrom('retailProducts')
      .selectAll()
      .where('barcode', '=', 'TEST-0001')
      .executeTakeFirst();
    expect(product).toBeDefined();
    expect(Number(product?.stock)).toBe(5);
    expect(Number(product?.price)).toBeCloseTo(9.5);

    const order = await manager
      .query()
      .insertInto('retailSalesOrders')
      .values({
        orderNumber: 'SO-TEST-1',
        storeName: '总店',
        cashierId: 'user-1',
        cashierName: 'Cashier',
        originalAmount: 9.5,
        discountPercent: 0,
        discountAmount: 0,
        payableAmount: 9.5,
        paymentMethod: 'cash',
        status: 'completed',
        soldAt: now,
        returnedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await manager
      .query()
      .insertInto('retailSalesOrderItems')
      .values({
        orderId: Number(order.insertId),
        productId: Number(product?.id),
        productName: 'Test product',
        barcode: 'TEST-0001',
        unitPrice: 9.5,
        quantity: 1,
        subtotal: 9.5,
        createdAt: now,
      })
      .execute();

    await manager
      .query()
      .insertInto('retailPurchaseOrders')
      .values({
        productId: Number(product?.id),
        productName: 'Test product',
        quantity: 10,
        unitCost: 4,
        supplier: 'Supplier A',
        purchaseDate: now,
        createdById: 'user-2',
        createdByName: 'Manager',
        createdAt: now,
      })
      .execute();

    const items = await manager
      .query()
      .selectFrom('retailSalesOrderItems')
      .selectAll()
      .execute();
    expect(items).toHaveLength(1);
    expect(Number(items[0]?.subtotal)).toBeCloseTo(9.5);

    const purchases = await manager
      .query()
      .selectFrom('retailPurchaseOrders')
      .selectAll()
      .execute();
    expect(purchases).toHaveLength(1);
  });

  it('rejects a duplicate barcode', async () => {
    const now = new Date().toISOString();
    await expect(
      manager
        .query()
        .insertInto('retailProducts')
        .values({
          name: 'Duplicate',
          barcode: 'TEST-0001',
          category: 'food',
          price: 1,
          cost: 0,
          stock: 0,
          status: 'on_sale',
          images: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it('reverses the schema when the migration is rolled back', async () => {
    const rolling = createManager();
    await rolling.connect();
    await retailMigration.up(await migrationContext(rolling));
    await rolling.query().selectFrom('retailProducts').selectAll().execute();

    await retailMigration.down?.(await migrationContext(rolling));
    await expect(
      rolling.query().selectFrom('retailProducts').selectAll().execute(),
    ).rejects.toThrow();
    await rolling.destroy();
  });
});
