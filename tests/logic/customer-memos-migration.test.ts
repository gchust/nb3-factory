// @vitest-environment node
import {
  createAppDatabaseManager,
  resolveDatabaseConfig,
} from '@nocobase/app-server/database';
import type {
  DatabaseManager,
  MigrationContext,
  SeedContext,
} from '@nocobase/db';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202608270001_create_customer_memos.js';
import seed from '../../database/main/seeds/202608270002_customer_memos_sample_records.js';

/**
 * The migration and the seed as the task loader runs them. The names are pinned
 * because the loader matches a file to the definition by name, and `up`/`down`
 * are run in order against a real SQLite database so a broken reverse stays a
 * test failure rather than a surprise during a rollback.
 */
let directory: string;
let database: DatabaseManager;

function migrationContext(): MigrationContext {
  return {
    builder: database.builder('main'),
    query: database.query('main'),
    repository: (collection: string) => database.repository(collection, 'main'),
    connection: database.connection('main'),
    config: {},
    container: {},
  } as unknown as MigrationContext;
}

function seedContext(): SeedContext {
  return {
    query: database.query('main'),
    repository: (collection: string) => database.repository(collection, 'main'),
    connection: database.connection('main'),
    config: {},
    container: {},
  } as unknown as SeedContext;
}

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'customer-memos-migration-'));
  const config = await resolveDatabaseConfig({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'database.sqlite'),
        schemaManagement: 'managed',
        debug: false,
      },
    },
  });
  const manager = createAppDatabaseManager(config);
  if (!manager) throw new Error('The test database manager was not created.');
  database = manager;
  await database.connect('main');
});

afterAll(async () => {
  await database?.destroy();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe('customer memo migration and seed', () => {
  it('uses the name the loader matches against its file name', () => {
    expect(migration.name).toBe('202608270001_create_customer_memos');
    expect(seed.name).toBe('202608270002_customer_memos_sample_records');
  });

  it('creates the table on up and drops it on down', async () => {
    await migration.up(migrationContext());

    // The collection is resolvable and writable once `up` has run.
    const repository = database.repository<{
      id: string;
      name: string;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
    }>('customerMemos', 'main');
    await repository.createOne({
      values: {
        id: 'probe',
        name: '探针',
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    await expect(
      database
        .query('main')
        .selectFrom('customerMemos')
        .select('name')
        .where('id', '=', 'probe')
        .executeTakeFirst(),
    ).resolves.toMatchObject({ name: '探针' });

    await migration.down?.(migrationContext());

    // The table is gone, so a query against it fails rather than returning rows.
    await expect(
      database.query('main').selectFrom('customerMemos').selectAll().execute(),
    ).rejects.toThrow();
  });

  it('inserts the sample records and skips names that are already present', async () => {
    await migration.up(migrationContext());
    await seed.run(seedContext());

    const afterFirstRun = await database
      .query('main')
      .selectFrom('customerMemos')
      .select('name')
      .execute();
    expect(afterFirstRun.map((row) => row.name).sort()).toEqual(
      ['云梯网络', '星海科技', '晨曦制造'].sort(),
    );

    // A hand-added record with one of the sample names must not be overwritten,
    // and running the seed again must not duplicate the other two.
    await database
      .query('main')
      .updateTable('customerMemos')
      .set({ notes: '人工修改' })
      .where('name', '=', '星海科技')
      .execute();
    await seed.run(seedContext());

    const afterSecondRun = await database
      .query('main')
      .selectFrom('customerMemos')
      .select('name')
      .execute();
    expect(afterSecondRun).toHaveLength(3);

    const edited = await database
      .query('main')
      .selectFrom('customerMemos')
      .select('notes')
      .where('name', '=', '星海科技')
      .executeTakeFirst();
    expect(edited?.notes).toBe('人工修改');

    await migration.down?.(migrationContext());
  });
});
