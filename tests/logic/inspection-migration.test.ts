import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createDatabaseManager,
  type DatabaseConnection,
  type MigrationContext,
  type SeedDefinition,
} from '@nocobase/db';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import recordPhotosMigration from '../../database/main/migrations/202609150005_create_inspection_record_photos.js';
import filesMigration from '../../database/main/migrations/202609150004_create_inspection_files.js';
import recordsMigration from '../../database/main/migrations/202609150003_create_inspection_records.js';
import plansMigration from '../../database/main/migrations/202609150002_create_inspection_plans.js';
import devicesMigration from '../../database/main/migrations/202609150001_create_inspection_devices.js';
import baselineSeed from '../../database/main/seeds/202609150010_seed_inspection_baseline.js';

const MIGRATIONS = [
  devicesMigration,
  plansMigration,
  recordsMigration,
  filesMigration,
  recordPhotosMigration,
];

const TABLES = [
  'inspection_devices',
  'inspection_plans',
  'inspection_records',
  'inspection_files',
  'inspection_record_photos',
];

describe('inspection schema', () => {
  let directory: string;
  let databasePath: string;
  let manager: ReturnType<typeof createDatabaseManager>;
  let connection: DatabaseConnection;

  beforeAll(async () => {
    directory = mkdtempSync(path.join(os.tmpdir(), 'nb3-inspection-'));
    databasePath = path.join(directory, 'test.sqlite');
    manager = createDatabaseManager({
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: databasePath } },
    });
    connection = await manager.connect('main');
  });

  afterAll(async () => {
    await manager.disconnect('main');
    rmSync(directory, { recursive: true, force: true });
  });

  function migrationContext(): MigrationContext {
    return {
      builder: connection.builder,
      query: connection.query,
      connection: connection as unknown as MigrationContext['connection'],
    };
  }

  async function runUp(): Promise<void> {
    for (const migration of MIGRATIONS) {
      await migration.up(migrationContext());
    }
  }

  async function runDown(): Promise<void> {
    for (const migration of [...MIGRATIONS].reverse()) {
      await migration.down?.(migrationContext());
    }
  }

  function readSchema(): Record<string, readonly string[]> {
    const reader = new Database(databasePath, { readonly: true });
    try {
      const tables = reader
        .prepare(
          "select name from sqlite_master where type = 'table' and name like 'inspection_%'",
        )
        .all() as readonly { name: string }[];
      return Object.fromEntries(
        tables.map(({ name }) => [
          name,
          (
            reader.prepare(`pragma table_info(${name})`).all() as readonly {
              name: string;
            }[]
          ).map((column) => column.name),
        ]),
      );
    } finally {
      reader.close();
    }
  }

  it('creates every collection with the declared fields', async () => {
    await runUp();
    const schema = readSchema();

    expect(Object.keys(schema).sort()).toEqual([...TABLES].sort());
    expect(schema.inspection_devices).toEqual(
      expect.arrayContaining([
        'id',
        'code',
        'name',
        'location',
        'type',
        'status',
        'created_at',
        'updated_at',
      ]),
    );
    expect(schema.inspection_plans).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'cycle',
        'team',
        'start_date',
        'status',
      ]),
    );
    expect(schema.inspection_records).toEqual(
      expect.arrayContaining([
        'id',
        'device_id',
        'plan_id',
        'result',
        'description',
        'team',
        'created_by_id',
        'created_at',
        'updated_at',
      ]),
    );
    expect(schema.inspection_files).toEqual(
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
    expect(schema.inspection_record_photos).toEqual(
      expect.arrayContaining(['id', 'record_id', 'file_id', 'created_at']),
    );
  });

  it('seeds the baseline devices and plans idempotently', async () => {
    const seed = baselineSeed as SeedDefinition;
    const seedContext = {
      query: connection.query,
      connection: connection as unknown as MigrationContext['connection'],
    };
    await seed.run(seedContext as never);
    await seed.run(seedContext as never);

    const devices = await connection.query
      .selectFrom('inspectionDevices')
      .select('id')
      .execute();
    const plans = await connection.query
      .selectFrom('inspectionPlans')
      .select('id')
      .execute();
    expect(devices).toHaveLength(5);
    expect(plans).toHaveLength(3);
  });

  it('reverses every migration', async () => {
    await runDown();
    expect(Object.keys(readSchema())).toEqual([]);
  });
});
