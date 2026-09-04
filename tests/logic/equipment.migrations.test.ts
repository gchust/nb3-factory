// @vitest-environment node
import path from 'node:path';

import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTempConfig, WORKSPACE_ROOT } from '../helpers/test-app.js';

interface RawClient {
  raw(sql: string): Promise<unknown>;
}

let db: DatabaseManager;
let dbPath: string;
let config: ReturnType<typeof createTempConfig>;

beforeAll(async () => {
  config = createTempConfig();
  dbPath = config.dbPath;
  db = createDatabaseManager({
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: dbPath, debug: false },
    },
  });
});

afterAll(async () => {
  await db.destroy();
  config.dispose();
});

function appMigrator() {
  return createMigrator({
    database: { connection: (name) => db.connection(name ?? 'main') },
    connection: 'main',
    directory: path.join(WORKSPACE_ROOT, 'database/migrations'),
    packageName: 'app',
  });
}

async function rawClient(): Promise<RawClient> {
  return (await db.connection().client<RawClient>()) as RawClient;
}

async function tableColumns(
  table: string,
): Promise<Map<string, { type: string; pk: number }>> {
  const client = await rawClient();
  const result = (await client.raw(`PRAGMA table_info(${table})`)) as unknown;
  const rows = Array.isArray(result)
    ? (result as Array<Record<string, unknown>>)
    : ((result as { rows?: unknown }).rows as Array<Record<string, unknown>>);
  return new Map(
    rows.map((row) => [
      String(row.name),
      { type: String(row.type), pk: Number(row.pk) },
    ]),
  );
}

async function tableNames(): Promise<string[]> {
  const client = await rawClient();
  const result = (await client.raw(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  )) as unknown;
  const rows = Array.isArray(result)
    ? (result as Array<Record<string, unknown>>)
    : ((result as { rows?: unknown }).rows as Array<Record<string, unknown>>);
  return rows.map((row) => String(row.name));
}

async function indexes(
  table: string,
): Promise<Array<{ name: string; unique: boolean; columns: string[] }>> {
  const client = await rawClient();
  const result = (await client.raw(`PRAGMA index_list(${table})`)) as unknown;
  const rows = Array.isArray(result)
    ? (result as Array<Record<string, unknown>>)
    : ((result as { rows?: unknown }).rows as Array<Record<string, unknown>>);
  const out: Array<{ name: string; unique: boolean; columns: string[] }> = [];
  for (const row of rows) {
    const info = (await client.raw(
      `PRAGMA index_info(${String(row.name)})`,
    )) as unknown;
    const infoRows = Array.isArray(info)
      ? (info as Array<Record<string, unknown>>)
      : ((info as { rows?: unknown }).rows as Array<Record<string, unknown>>);
    out.push({
      name: String(row.name),
      unique: Number(row.unique) === 1,
      columns: infoRows.map((item) => String(item.name)),
    });
  }
  return out;
}

describe('equipment migrations', () => {
  it('up creates the equipment ledger and borrow record tables', async () => {
    const result = await appMigrator().latest();
    expect(result.executed).toEqual(
      expect.arrayContaining([
        '202609040001_create_equipment',
        '202609040002_create_equipment_borrow_records',
      ]),
    );

    // Physical schema: the default naming strategy snake_cases columns.
    const equipment = await tableColumns('equipment');
    expect(equipment.get('id')?.pk).toBe(1);
    expect(equipment.get('name')?.type).toMatch(/varchar|text/i);
    expect(equipment.get('asset_number')?.type).toMatch(/varchar|text/i);
    expect(equipment.get('category')?.type).toMatch(/varchar|text/i);
    expect(equipment.get('status')?.type).toMatch(/varchar|text/i);
    expect(equipment.get('description')?.type).toBeTruthy();
    expect(equipment.get('created_at')).toBeTruthy();
    expect(equipment.get('updated_at')).toBeTruthy();

    const records = await tableColumns('equipment_borrow_record');
    expect(records.get('id')?.pk).toBe(1);
    expect(records.get('equipment_id')).toBeTruthy();
    expect(records.get('borrower_id')).toBeTruthy();
    expect(records.get('borrower_name')).toBeTruthy();
    expect(records.get('borrowed_at')).toBeTruthy();
    expect(records.get('returned_at')).toBeTruthy();
    expect(records.get('note')).toBeTruthy();

    const equipmentIndexes = await indexes('equipment');
    const unique = equipmentIndexes.find((index) => index.unique);
    expect(unique).toBeDefined();
    expect(unique?.columns).toContain('asset_number');
    expect(
      equipmentIndexes.some(
        (index) => !index.unique && index.columns.includes('status'),
      ),
    ).toBe(true);
  });

  it('round-trips rows through the logical (camelCase) query layer', async () => {
    const now = new Date().toISOString();
    await db
      .query()
      .insertInto('equipment')
      .values({
        name: 'Round trip laptop',
        assetNumber: 'RT-0001',
        category: '电脑',
        status: 'available',
        description: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const row = await db
      .query()
      .selectFrom('equipment')
      .select(['id', 'name', 'assetNumber', 'status'])
      .where('assetNumber', '=', 'RT-0001')
      .executeTakeFirst();
    expect(row?.name).toBe('Round trip laptop');
    expect(row?.status).toBe('available');

    const borrowed = await db
      .query()
      .selectFrom('equipment')
      .select(['name'])
      .where('status', '=', 'available')
      .execute();
    expect(borrowed.map((entry) => entry.name)).toContain('Round trip laptop');
    expect(borrowed.map((entry) => entry.name)).not.toContain(
      'Borrowed laptop',
    );
  });

  it('down drops the tables in a safe order', async () => {
    const result = await appMigrator().rollback();
    expect(result.rolledBack).toEqual(
      expect.arrayContaining([
        '202609040001_create_equipment',
        '202609040002_create_equipment_borrow_records',
      ]),
    );

    const names = await tableNames();
    expect(names).not.toContain('equipment');
    expect(names).not.toContain('equipmentBorrowRecord');
  });
});
