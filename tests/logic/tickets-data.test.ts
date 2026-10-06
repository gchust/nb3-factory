// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';
import migration from '../../database/main/migrations/202609290001_create_repair_tickets.ts';

/**
 * Schema and installation-data coverage for repair tickets.
 *
 * The migration is exercised up and down against a real SQLite database rather
 * than a mocked builder, and the seeds are run through the real seeder so their
 * idempotence — the property that lets them repeat on every start without
 * duplicating fixtures or undoing an administrator's edits — is what is tested.
 */
let server: StandaloneServer;
let database: DatabaseManager;
let databaseDir: string;
let clientDir: string;

beforeAll(async () => {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  databaseDir = mkdtempSync(path.join(tmpdir(), 'nocobase-tickets-data-'));
  clientDir = mkdtempSync(path.join(tmpdir(), 'nocobase-tickets-data-client-'));
  writeFileSync(
    path.join(clientDir, 'index.html'),
    '<main>Tickets data test</main>',
  );
  const configFile = path.join(databaseDir, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      app: { publicOrigin: 'http://localhost' },
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(databaseDir, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        // The seeds are driven explicitly below so their first run, their
        // repeat run and their behaviour beside existing data are all visible.
        seeds: { autoRun: false },
      },
      hub: { host: { enabled: false } },
    }),
  );

  server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'false',
      APP_CONFIG_FILE: configFile,
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir,
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });
  database =
    server.application.container.resolve<DatabaseManager>(databaseManagerToken);
}, 180_000);

afterAll(async () => {
  await server?.close();
  if (databaseDir) {
    rmSync(databaseDir, { recursive: true, force: true });
  }
  if (clientDir) {
    rmSync(clientDir, { recursive: true, force: true });
  }
});

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await database
      .query()
      .selectFrom(tableName)
      .select('id')
      .limit(1)
      .execute();
    return true;
  } catch {
    return false;
  }
}

async function selectIds(
  table: string,
  where?: { column: string; value: string },
): Promise<string[]> {
  let query = database.query().selectFrom(table).select('id');
  if (where) {
    query = query.where(where.column, '=', where.value);
  }
  const rows = (await query.execute()) as unknown as { id: unknown }[];
  return rows.map((row) => String(row.id));
}

function seederWithHistory(tableName: string) {
  return database.createSeeder({
    directory: path.resolve(import.meta.dirname, '../../database/main/seeds'),
    packageName: 'nb3-factory',
    tableName,
    lockTableName: `${tableName}_lock`,
  });
}

describe('repair tickets migration', () => {
  it('creates the collection on up and removes it on down', async () => {
    const context = {
      builder: database.builder(),
    } as unknown as Parameters<typeof migration.up>[0];

    expect(await tableExists('repairTickets')).toBe(true);

    await migration.down?.(context);
    expect(await tableExists('repairTickets')).toBe(false);

    await migration.up(context);
    expect(await tableExists('repairTickets')).toBe(true);

    const recreated = await database.collections().getPhysical('repairTickets');
    expect(recreated?.columns.map((column) => column.columnName)).toEqual(
      expect.arrayContaining([
        'id',
        'title',
        'category',
        'description',
        'status',
        'resolution',
        'submitter_id',
        'handler_id',
        'started_at',
        'completed_at',
        'created_at',
        'updated_at',
      ]),
    );
    expect(
      recreated?.foreignKeys.map((key) => key.referencedCollection.tableName),
    ).toEqual(expect.arrayContaining(['user']));
  });
});

describe('repair ticket seeds', () => {
  it('installs the permission sets, demo accounts and tickets on a first run', async () => {
    const result = await seederWithHistory('test_seed_history').run();

    expect(result.executed).toEqual([
      '202609290002_repair_tickets_permission_sets',
      '202609290003_repair_tickets_demo_data',
    ]);

    const permissionSets = await database
      .query()
      .selectFrom('authorizationPermissionSets')
      .select(['key'])
      .where('key', 'in', ['it-employee', 'it-handler'])
      .execute();
    expect(permissionSets).toHaveLength(2);

    const accounts = await database
      .query()
      .selectFrom('user')
      .select('id')
      .where('username', 'in', ['li.wei', 'wang.fang', 'chen.hao'])
      .execute();
    expect(accounts).toHaveLength(3);

    expect(await selectIds('repairTickets')).toHaveLength(3);
    expect(
      await selectIds('authorizationPermissionSetAssignments'),
    ).toHaveLength(3);
  });

  it('does not duplicate anything on a repeat run', async () => {
    const seeder = seederWithHistory('test_seed_history');
    const result = await seeder.run();

    expect(result.executed).toEqual([]);
    expect(await selectIds('repairTickets')).toHaveLength(3);
    expect(
      await selectIds('authorizationPermissionSetAssignments'),
    ).toHaveLength(3);
  });

  it('leaves existing data and administrator edits untouched when it re-runs', async () => {
    // A fresh history table forces every seed to execute again, as it would
    // after an administrator reset the seed history. The seeds' own guards,
    // not the history, must keep the installation stable.
    await database
      .query()
      .updateTable('authorizationPermissionSets')
      .set({ title: 'Custom IT handler title' })
      .where('key', '=', 'it-handler')
      .execute();

    const result = await seederWithHistory('test_seed_history_again').run();
    expect(result.executed).toHaveLength(2);

    expect(await selectIds('repairTickets')).toHaveLength(3);
    expect(
      await selectIds('authorizationPermissionSetAssignments'),
    ).toHaveLength(3);

    const edited = await database
      .query()
      .selectFrom('authorizationPermissionSets')
      .select('title')
      .where('key', '=', 'it-handler')
      .executeTakeFirst();
    expect(edited?.title).toBe('Custom IT handler title');
  });
});
