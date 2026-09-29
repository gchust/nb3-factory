// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDatabaseManager, defineDatabase } from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609010001_create_service_core.js';

const SERVICE_TABLES = [
  'service_customers',
  'service_devices',
  'service_tickets',
  'service_inspections',
  'service_knowledge_articles',
  'service_ticket_shares',
  'service_execution_logs',
  'service_ticket_files',
  'service_ticket_attachments',
];

const tempDirs: string[] = [];
const managers: { destroy: () => Promise<void> }[] = [];

function createTestDatabase(): ReturnType<typeof createDatabaseManager> {
  const dir = mkdtempSync(path.join(tmpdir(), 'nb-service-migration-'));
  tempDirs.push(dir);
  const database = createDatabaseManager(
    defineDatabase({
      default: 'main',
      connections: {
        main: sqlite({ filename: path.join(dir, 'test.sqlite') }),
      },
    }),
  );
  managers.push(database);
  return database;
}

async function listServiceTables(
  database: ReturnType<typeof createDatabaseManager>,
): Promise<string[]> {
  const client = await database.connection('main').client();
  const rows = (await client.raw(
    "select name from sqlite_master where type = 'table'",
  )) as { name: string }[];
  return rows
    .map((row) => row.name)
    .filter((name) => SERVICE_TABLES.includes(name))
    .sort();
}

async function migrate(
  database: ReturnType<typeof createDatabaseManager>,
): Promise<void> {
  const migrator = database.createMigrator({
    directory: path.resolve(process.cwd(), 'database/main/migrations'),
    packageName: 'nb3-factory',
  });
  await migrator.latest();
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.destroy()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('service core migration', () => {
  it('names itself after its filename', () => {
    expect(migration.name).toBe('202609010001_create_service_core');
  });

  it('creates every business table and rolls them all back', async () => {
    const database = createTestDatabase();
    expect(await listServiceTables(database)).toEqual([]);

    await migrate(database);

    expect(await listServiceTables(database)).toEqual(
      [...SERVICE_TABLES].sort(),
    );

    const migrator = database.createMigrator({
      directory: path.resolve(process.cwd(), 'database/main/migrations'),
      packageName: 'nb3-factory',
    });
    await migrator.rollback();
    expect(await listServiceTables(database)).toEqual([]);
  });

  it('keeps migrations idempotent across repeated runs', async () => {
    const database = createTestDatabase();
    await migrate(database);
    const client = await database.connection('main').client();
    const before = await client('service_tickets').count<{ count: number }[]>();
    await migrate(database);
    const after = await client('service_tickets').count<{ count: number }[]>();
    expect(after).toEqual(before);
  });
});
