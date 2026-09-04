// @vitest-environment node
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import {
  databaseConfig,
  runAppMigrations,
  runAppSeeds,
} from '@nocobase/app-server/database';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTempConfig, WORKSPACE_ROOT } from '../helpers/test-app.js';
import appRuntime from '../../server/runtime.js';

let config: ReturnType<typeof createTempConfig>;
let dbPath: string;

beforeAll(async () => {
  config = createTempConfig();
  dbPath = config.dbPath;
  const runtime = await resolveStandaloneAppRuntime(appRuntime, {
    rootDir: WORKSPACE_ROOT,
    configPath: config.configPath,
  });
  const dbConfig = runtime.appConfig.get(databaseConfig);
  await runAppMigrations(dbConfig, runtime.configPaths);
  await runAppSeeds(dbConfig, runtime.configPaths);
});

afterAll(() => {
  config.dispose();
});

function openDatabase(): DatabaseManager {
  return createDatabaseManager({
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: dbPath, debug: false },
    },
  });
}

async function equipmentRows(): Promise<
  Array<{ id: number; name: string; assetNumber: string; status: string }>
> {
  const db = openDatabase();
  try {
    const rows = await db
      .query()
      .selectFrom('equipment')
      .select(['id', 'name', 'assetNumber', 'status'])
      .execute();
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      assetNumber: String(row.assetNumber),
      status: String(row.status),
    }));
  } finally {
    await db.destroy();
  }
}

async function borrowRecordCounts(): Promise<{
  total: number;
  open: number;
}> {
  const db = openDatabase();
  try {
    const rows = await db
      .query()
      .selectFrom('equipmentBorrowRecord')
      .select(['returnedAt'])
      .execute();
    return {
      total: rows.length,
      open: rows.filter((row) => row.returnedAt === null).length,
    };
  } finally {
    await db.destroy();
  }
}

describe('office equipment seed', () => {
  it('provides the sample ledger and borrow examples a fresh install needs', async () => {
    const equipment = await equipmentRows();
    expect(equipment.length).toBeGreaterThanOrEqual(6);

    const statuses = new Set(equipment.map((row) => row.status));
    expect(statuses.has('available')).toBe(true);
    expect(statuses.has('borrowed')).toBe(true);

    const assetNumbers = new Set(equipment.map((row) => row.assetNumber));
    expect(assetNumbers.size).toBe(equipment.length);

    const counts = await borrowRecordCounts();
    expect(counts.total).toBeGreaterThanOrEqual(2);
    expect(counts.open).toBeGreaterThanOrEqual(1);

    // The equipment carrying the open borrow record is actually borrowed.
    const db = openDatabase();
    try {
      const openRecord = await db
        .query()
        .selectFrom('equipmentBorrowRecord')
        .select(['equipmentId'])
        .where('returnedAt', 'is', null)
        .limit(1)
        .executeTakeFirst();
      expect(openRecord).toBeDefined();
      const equipmentOf = await db
        .query()
        .selectFrom('equipment')
        .select(['status'])
        .where('id', '=', Number(openRecord?.equipmentId))
        .executeTakeFirst();
      expect(String(equipmentOf?.status)).toBe('borrowed');
    } finally {
      await db.destroy();
    }
  });

  it('is idempotent: rerunning never duplicates rows', async () => {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: WORKSPACE_ROOT,
      configPath: config.configPath,
    });
    const dbConfig = runtime.appConfig.get(databaseConfig);

    const before = (await equipmentRows()).length;
    await runAppSeeds(dbConfig, runtime.configPaths);
    await runAppSeeds(dbConfig, runtime.configPaths);

    expect((await equipmentRows()).length).toBe(before);
    const counts = await borrowRecordCounts();
    expect(counts.total).toBeGreaterThanOrEqual(2);
  });

  it('does not overwrite edits made after the first run', async () => {
    const db = openDatabase();
    const original = await db
      .query()
      .selectFrom('equipment')
      .select(['id', 'name'])
      .where('status', '=', 'available')
      .limit(1)
      .executeTakeFirst();
    expect(original).toBeDefined();
    const id = Number(original?.id);
    const editedName = 'Renamed by a user (must survive reseeding)';
    await db
      .query()
      .updateTable('equipment')
      .set({ name: editedName, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .execute();
    await db.destroy();

    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: WORKSPACE_ROOT,
      configPath: config.configPath,
    });
    const dbConfig = runtime.appConfig.get(databaseConfig);
    await runAppSeeds(dbConfig, runtime.configPaths);

    const db2 = openDatabase();
    try {
      const after = await db2
        .query()
        .selectFrom('equipment')
        .select(['name'])
        .where('id', '=', id)
        .executeTakeFirst();
      expect(String(after?.name)).toBe(editedName);
    } finally {
      await db2.destroy();
    }
  });
});
