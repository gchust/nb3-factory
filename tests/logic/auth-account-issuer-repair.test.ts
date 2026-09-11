import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'database/main/migrations');

const REPAIR_MIGRATION_NAME =
  '202610010001_repair_auth_account_issuer_nullable';

interface TestDatabase {
  readonly db: DatabaseManager;
  readonly filename: string;
  cleanup(): void;
}

function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(path.join(tmpdir(), 'auth-account-repair-'));
  const filename = path.join(directory, 'test.sqlite');
  const db = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename,
        schemaManagement: 'managed',
      },
    },
  });
  return {
    db,
    filename,
    cleanup: () => {
      void db.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function pragmaTableInfo(
  filename: string,
  table: string,
): Array<{ name: string; type: string; notnull: number }> {
  const sqlite = new Database(filename, { readonly: true });
  try {
    return sqlite.prepare(`pragma table_info(${table})`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
  } finally {
    sqlite.close();
  }
}

function indexNames(filename: string, table: string): string[] {
  const sqlite = new Database(filename, { readonly: true });
  try {
    return sqlite
      .prepare(`pragma index_list(${table})`)
      .all()
      .map((row) => row.name as string);
  } finally {
    sqlite.close();
  }
}

/**
 * Replicates the `account` table as the authentication plugin migration creates
 * it (`create_authentication_tables`): `issuer` is NOT NULL, with the unique
 * (issuer, account_id) and user_id indexes.
 */
async function createAccountTable(database: TestDatabase): Promise<void> {
  const knex = await database.db.connection('main').client();
  await knex.schema.createTable('account', (table) => {
    table.string('id', 64).primary();
    table.string('issuer', 255).notNullable();
    table.string('account_id', 320).notNullable();
    table.string('provider_id', 128).notNullable();
    table.string('user_id', 64).notNullable();
    table.text('access_token').nullable();
    table.text('refresh_token').nullable();
    table.text('id_token').nullable();
    table.text('access_token_expires_at').nullable();
    table.text('refresh_token_expires_at').nullable();
    table.text('scope').nullable();
    table.text('password').nullable();
    table.text('created_at').notNullable();
    table.text('updated_at').notNullable();
    table.unique(['issuer', 'account_id'], {
      indexName: 'uq_account_issuer_account',
    });
  });
  await knex.raw('create index `idx_account_user` on `account` (`user_id`)');
}

describe('auth account issuer repair migration', () => {
  let database: TestDatabase;
  let migrator: ReturnType<typeof createMigrator>;

  beforeEach(async () => {
    database = createTestDatabase();
    await database.db.connect('main');
    await createAccountTable(database);
    migrator = createMigrator({
      database: database.db,
      directory: MIGRATIONS_DIR,
    });
  });

  afterEach(() => {
    database.cleanup();
  });

  it('up makes issuer nullable while preserving rows and indexes, and down restores NOT NULL after backfilling NULL issuers', async () => {
    const knex = await database.db.connection('main').client();
    const adminId = '00000000-0000-4000-8000-000000000001';
    const credentialId = '00000000-0000-4000-8000-000000000002';
    await knex('account').insert([
      {
        id: adminId,
        issuer: 'local:credential',
        account_id: 'user-admin',
        provider_id: 'credential',
        user_id: 'user-admin',
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
      {
        id: credentialId,
        issuer: 'local:credential',
        account_id: 'user-credential',
        provider_id: 'credential',
        user_id: 'user-credential',
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
    ]);

    const run = await migrator.latest();
    expect(run.executed).toContain(REPAIR_MIGRATION_NAME);

    // The column must now accept NULL so better-auth's credential sign-up
    // (which inserts account rows without an issuer) no longer fails.
    const issuer = pragmaTableInfo(database.filename, 'account').find(
      (column) => column.name === 'issuer',
    );
    expect(issuer?.notnull).toBe(0);

    // Existing rows survive the rebuild.
    const rows = await knex('account').select('id', 'issuer').orderBy('id');
    expect(rows).toEqual([
      { id: adminId, issuer: 'local:credential' },
      { id: credentialId, issuer: 'local:credential' },
    ]);

    // Both indexes survive.
    expect(indexNames(database.filename, 'account')).toEqual(
      expect.arrayContaining(['uq_account_issuer_account', 'idx_account_user']),
    );

    // A real sign-up insert (issuer omitted) now succeeds.
    await knex('account').insert({
      id: '00000000-0000-4000-8000-000000000003',
      account_id: 'user-signed-up',
      provider_id: 'credential',
      user_id: 'user-signed-up',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
    });
    const inserted = await knex('account')
      .select('id', 'issuer')
      .where('id', '00000000-0000-4000-8000-000000000003')
      .first();
    expect(inserted?.issuer).toBeNull();

    // A duplicate (issuer, account_id) is still rejected by the unique index.
    await expect(
      knex('account').insert({
        id: '00000000-0000-4000-8000-000000000004',
        issuer: 'local:credential',
        account_id: 'user-admin',
        provider_id: 'credential',
        user_id: 'user-admin',
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      }),
    ).rejects.toThrow();

    // Roll back: NULL issuers are backfilled to the seed convention and the
    // NOT NULL constraint is restored.
    const rolledBack = await migrator.rollback();
    expect(rolledBack.rolledBack).toContain(REPAIR_MIGRATION_NAME);

    const afterDown = pragmaTableInfo(database.filename, 'account').find(
      (column) => column.name === 'issuer',
    );
    expect(afterDown?.notnull).toBe(1);
    const backfilled = await knex('account')
      .select('id', 'issuer')
      .orderBy('id');
    expect(backfilled).toEqual([
      { id: adminId, issuer: 'local:credential' },
      { id: credentialId, issuer: 'local:credential' },
      {
        id: '00000000-0000-4000-8000-000000000003',
        issuer: 'local:credential',
      },
    ]);
  });

  it('no-ops safely when the account table is absent', async () => {
    // App-scoped migration runs (e.g. migrators pointed only at the app
    // directory) may see no account table at all; the guard must record and
    // complete the migration without creating or corrupting anything.
    const knex = await database.db.connection('main').client();
    await knex.schema.dropTable('account');

    const run = await migrator.latest();
    expect(run.executed).toContain(REPAIR_MIGRATION_NAME);

    const tables = (await knex.raw(
      "select name from sqlite_master where type = 'table' and name = 'account'",
    )) as Array<{ name: string }>;
    expect(tables).toHaveLength(0);
  });
});
