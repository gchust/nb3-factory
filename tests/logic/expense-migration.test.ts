import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  InMemoryCollectionMetadataStore,
  createDatabaseManager,
  createMigrator,
  defineDatabase,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Vitest runs with the application root as its working directory.
const rootDir = process.cwd();

interface SchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

const EXPECTED_TABLES = [
  'expense_departments',
  'expense_claims',
  'expense_receipts',
  'expense_receipt_files',
];

describe('expense suite migration', () => {
  let directory: string;
  let database: ReturnType<typeof createDatabaseManager>;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'expense-migration-'));
    const config = defineDatabase({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: path.join(directory, 'test.sqlite'),
          schemaManagement: 'managed',
        },
      },
      metadataStore: new InMemoryCollectionMetadataStore(),
    });
    database = createDatabaseManager(config);
  });

  afterEach(async () => {
    await database.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('creates the expense tables and drops them again on rollback', async () => {
    const migrator = createMigrator({
      database,
      connection: 'main',
      directory: path.join(rootDir, 'database/main/migrations'),
      tableName: 'test_expense_migrations',
      lockTableName: 'test_expense_migration_lock',
    });

    const applied = await migrator.latest();
    expect(applied.executed).toContain('202609140001_create_expense_suite');

    const client = await database.connection('main').client<SchemaClient>();
    for (const table of EXPECTED_TABLES) {
      expect(await client.schema.hasTable(table), `missing ${table}`).toBe(
        true,
      );
    }

    // The columns the routes and the file repository depend on really exist.
    const rows = await database
      .query()
      .selectFrom('expenseClaims')
      .select(['id', 'applicantId', 'totalAmount', 'receiptCount'])
      .execute();
    expect(rows).toEqual([]);

    await migrator.rollback();

    for (const table of EXPECTED_TABLES) {
      expect(await client.schema.hasTable(table), `left behind ${table}`).toBe(
        false,
      );
    }
  });

  it('is repeatable: a second run applies nothing', async () => {
    const migrator = createMigrator({
      database,
      connection: 'main',
      directory: path.join(rootDir, 'database/main/migrations'),
      tableName: 'test_expense_migrations',
      lockTableName: 'test_expense_migration_lock',
    });

    await migrator.latest();
    const second = await migrator.latest();
    expect(second.executed).toEqual([]);
  });
});
