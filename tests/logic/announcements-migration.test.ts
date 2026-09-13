import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createTestDatabase,
  tableExists,
  type TestDatabase,
} from '../support/database.js';

interface ColumnInfo {
  readonly type: string;
  readonly nullable: boolean;
}

type ColumnInfoTable = Record<string, ColumnInfo>;

interface KnexClient {
  (table: string): { columnInfo(): Promise<ColumnInfoTable> };
  raw(sql: string): Promise<unknown>;
}

let testDatabase: TestDatabase;

beforeEach(async () => {
  testDatabase = await createTestDatabase();
});

afterEach(async () => {
  await testDatabase.cleanup();
});

describe('202609130001_create_announcements', () => {
  it('creates the announcements table and its sort index', async () => {
    await testDatabase.migrate();

    expect(await tableExists(testDatabase.database, 'announcements')).toBe(
      true,
    );

    const connection = await testDatabase.database.connect();
    const client = await connection.client<KnexClient>();
    const columns = await client('announcements').columnInfo();

    expect(Object.keys(columns).sort()).toEqual([
      'body',
      'created_at',
      'id',
      'title',
    ]);
    expect(columns.title.nullable).toBe(false);
    expect(columns.body.nullable).toBe(false);
    expect(columns.created_at.nullable).toBe(false);

    const indexes = await readIndexNames(client, 'announcements');
    expect(indexes).toContain('idx_announcements_created_at');
  });

  it('drops the announcements table on rollback', async () => {
    await testDatabase.migrate();
    expect(await tableExists(testDatabase.database, 'announcements')).toBe(
      true,
    );

    await testDatabase.rollback();
    expect(await tableExists(testDatabase.database, 'announcements')).toBe(
      false,
    );
  });
});

async function readIndexNames(
  client: KnexClient,
  table: string,
): Promise<readonly string[]> {
  const result = await client.raw(
    `select name from sqlite_master where type = 'index' and tbl_name = '${table}'`,
  );
  const rows = normalizeRows(result);
  return rows.flatMap((row) =>
    typeof row.name === 'string' ? [row.name] : [],
  );
}

function normalizeRows(result: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(result)) return [];
  // better-sqlite3 returns the rows directly; some drivers wrap them one array deep.
  const rows = Array.isArray(result[0]) ? (result[0] as unknown[]) : result;
  return rows.filter(
    (row): row is Record<string, unknown> =>
      typeof row === 'object' && row !== null,
  );
}
