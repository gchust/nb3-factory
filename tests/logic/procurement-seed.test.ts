// @vitest-environment node
import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  type DatabaseManager,
  type SeedContext,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609190001_create_procurement_tables.js';
import rolesSeed from '../../database/main/seeds/202609190002_seed_procurement_roles.js';
import demoSeed from '../../database/main/seeds/202609190003_seed_procurement_demo_data.js';

describe('procurement seeds', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const connection = database.connection();
    await migration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    } as never);
    await createPrerequisiteTables();
    await connection.query
      .insertInto('authorizationPermissionSets')
      .values({
        id: crypto.randomUUID(),
        key: 'default-pages',
        title: 'Default pages',
        grants: JSON.stringify([
          {
            resource: { type: 'page', id: 'home' },
            actions: [{ action: 'access' }],
          },
        ]),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function createPrerequisiteTables(): Promise<void> {
    const builder = database.connection().builder;
    await builder.createCollection('user', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('username', { length: 255 }).nullable();
      collection.string('email', { length: 320 }).notNull();
      collection.boolean('emailVerified').notNull().defaultTo(false);
      collection.text('image').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id');
    });
    await builder.createCollection('account', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('issuer', { length: 255 }).notNull();
      collection.string('accountId', { length: 320 }).notNull();
      collection.string('providerId', { length: 128 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.text('password').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id');
    });
    await builder.createCollection(
      'authorizationPermissionSets',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('key', { length: 255 }).notNull();
        collection.string('title', { length: 255 }).nullable();
        collection.json('grants').notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.primary('id');
        collection.unique('key');
      },
    );
    await builder.createCollection(
      'authorizationPermissionSetAssignments',
      (collection) => {
        collection.string('id', { length: 255 }).notNull();
        collection.string('subjectType', { length: 64 }).notNull();
        collection.string('subjectId', { length: 255 }).notNull();
        collection.string('permissionSetKey', { length: 255 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.primary('id');
      },
    );
  }

  const runSeeds = async () => {
    const connection = database.connection();
    const query = connection.query as SeedContext['query'];
    await rolesSeed.run({ query, connection } as never);
    await demoSeed.run({ query, connection } as never);
  };

  it('creates roles, demo accounts and page access once', async () => {
    await runSeeds();
    await runSeeds();

    const query = database.connection().query;
    const users = await query
      .selectFrom('user')
      .select('username')
      .where('username', 'in', ['manager1', 'buyer1', 'buyer2', 'warehouse1'])
      .execute();
    expect(users.map((user) => user.username).sort()).toEqual([
      'buyer1',
      'buyer2',
      'manager1',
      'warehouse1',
    ]);

    const permissionSets = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .execute();
    expect(permissionSets.map((set) => set.key).sort()).toEqual([
      'default-pages',
      'procurement-buyer',
      'procurement-manager',
      'warehouse-keeper',
    ]);

    const assignments = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['permissionSetKey'])
      .where('subjectType', '=', 'user')
      .execute();
    expect(assignments).toHaveLength(4);

    const defaultPages = await query
      .selectFrom('authorizationPermissionSets')
      .select('grants')
      .where('key', '=', 'default-pages')
      .executeTakeFirstOrThrow();
    const grants: unknown =
      typeof defaultPages.grants === 'string'
        ? JSON.parse(defaultPages.grants)
        : defaultPages.grants;
    expect(grants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resource: { type: 'page', id: 'procurement-orders' },
        }),
        expect.objectContaining({
          resource: { type: 'page', id: 'procurement-receipts' },
        }),
      ]),
    );
  });

  it('creates the demonstration data once with every order status', async () => {
    await runSeeds();
    await runSeeds();

    const query = database.connection().query;
    const count = async (table: string) =>
      (await query.selectFrom(table).select('id').execute()).length;

    expect(await count('suppliers')).toBe(6);
    expect(await count('materials')).toBe(12);
    expect(await count('purchaseOrders')).toBe(8);
    expect(await count('purchaseOrderItems')).toBe(14);
    expect(await count('goodsReceipts')).toBe(4);
    expect(await count('goodsReceiptItems')).toBe(5);

    const orders = await query
      .selectFrom('purchaseOrders')
      .select(['status', 'buyerId'])
      .execute();
    const statuses = new Set(orders.map((order) => order.status));
    expect([...statuses].sort()).toEqual([
      'approved',
      'draft',
      'rejected',
      'submitted',
    ]);
    expect(new Set(orders.map((order) => order.buyerId)).size).toBe(2);

    const received = await query
      .selectFrom('purchaseOrderItems')
      .select(['receivedQuantity'])
      .execute();
    expect(
      received.filter((item) => Number(item.receivedQuantity) > 0).length,
    ).toBe(4);
  });
});
