// @vitest-environment node
import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609190001_create_procurement_tables.js';

interface TableInfoRow {
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
  readonly pk: number;
}

interface IndexListRow {
  readonly name: string;
  readonly unique: number;
}

describe('procurement schema migration', () => {
  let database: DatabaseManager;

  beforeEach(() => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  const run = (direction: 'up' | 'down') => {
    const connection = database.connection();
    return migration[direction]({
      builder: connection.builder,
      query: connection.query,
      connection,
    } as never);
  };

  it('creates the business tables with their columns and constraints', async () => {
    await run('up');
    const client = (await database.connection().client()) as {
      schema: { hasTable(table: string): Promise<boolean> };
      raw(sql: string, bindings?: unknown[]): Promise<unknown>;
    };

    for (const table of [
      'suppliers',
      'materials',
      'purchase_orders',
      'purchase_order_items',
      'goods_receipts',
      'goods_receipt_items',
      'procurement_files',
      'procurement_attachments',
    ]) {
      expect(await client.schema.hasTable(table)).toBe(true);
    }

    const orderColumns = (await client.raw(
      'select * from pragma_table_info(?)',
      ['purchase_orders'],
    )) as TableInfoRow[];
    const orderNames = orderColumns.map((column) => column.name);
    expect(orderNames).toEqual(
      expect.arrayContaining([
        'order_no',
        'supplier_id',
        'buyer_id',
        'status',
        'total_amount',
        'reject_reason',
        'submitted_at',
        'reviewed_at',
        'reviewer_id',
      ]),
    );

    const itemColumns = (await client.raw(
      'select * from pragma_table_info(?)',
      ['purchase_order_items'],
    )) as TableInfoRow[];
    const quantity = itemColumns.find((column) => column.name === 'quantity');
    expect(quantity?.notnull).toBe(1);

    const indexes = (await client.raw('select * from pragma_index_list(?)', [
      'purchase_orders',
    ])) as IndexListRow[];
    expect(indexes.some((index) => index.unique === 1)).toBe(true);

    const fileColumns = (await client.raw(
      'select * from pragma_table_info(?)',
      ['procurement_files'],
    )) as TableInfoRow[];
    expect(fileColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'id',
        'disk',
        'key',
        'filename',
        'ext',
        'mime_type',
        'size',
        'created_at',
        'updated_at',
      ]),
    );
  });

  it('reverses the schema', async () => {
    await run('up');
    await run('down');
    const client = (await database.connection().client()) as {
      schema: { hasTable(table: string): Promise<boolean> };
    };
    for (const table of [
      'suppliers',
      'materials',
      'purchase_orders',
      'purchase_order_items',
      'goods_receipts',
      'goods_receipt_items',
      'procurement_files',
      'procurement_attachments',
    ]) {
      expect(await client.schema.hasTable(table)).toBe(false);
    }
  });
});
