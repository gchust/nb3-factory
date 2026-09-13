import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = path.resolve(
  process.cwd(),
  'database',
  'main',
  'migrations',
);

const require = createRequire(import.meta.url);
const AUTH_MIGRATIONS_DIR = path.join(
  path.dirname(
    require.resolve('@nocobase/app-plugin-authentication/package.json'),
  ),
  'dist',
  'database',
  'migrations',
);

const ACCOUNT_TABLE_MIGRATION = '202608200001_create_authentication_tables';
const CONTRACTS_MIGRATION = '202609130002_create_contracts';
const ISSUER_MIGRATION = '202609130004_default_account_issuer';
const DEFAULT_ISSUER = 'local:credential';

/**
 * Reproduces the self-registration failure: better-auth's credential provider
 * inserts an `account` row without `issuer`, while the plugin migration makes
 * that column NOT NULL. The application migration gives it a default.
 */
describe('default account issuer migration', () => {
  let manager: DatabaseManager;
  let directory: string;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'account-issuer-'));
    manager = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: path.join(directory, 'database.sqlite'),
        },
      },
    });
    await manager.connect('main');
  });

  afterEach(async () => {
    await manager.destroy();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function migrator() {
    return manager.createMigrator({
      sources: [
        {
          packageName: '@nocobase/app-plugin-authentication',
          directory: AUTH_MIGRATIONS_DIR,
        },
        { packageName: 'app', directory: MIGRATIONS_DIR },
      ],
    });
  }

  const insertAccountWithoutIssuer = (id: string, userId: string) =>
    manager
      .query('main')
      .insertInto('account')
      .values({
        id,
        accountId: userId,
        providerId: 'credential',
        userId,
        password: 'hash',
        createdAt: '2026-09-13T00:00:00.000',
        updatedAt: '2026-09-13T00:00:00.000',
      })
      .execute();

  it('lets an account insert that omits issuer succeed with the default', async () => {
    // Apply everything up to (but not including) the issuer migration.
    const throughContracts = await migrator().upTo(CONTRACTS_MIGRATION);
    expect(throughContracts.executed).not.toContain(ISSUER_MIGRATION);

    await expect(
      insertAccountWithoutIssuer('acct-before', 'user-before'),
    ).rejects.toThrow(/issuer/i);

    // The issuer migration is the only migration in the next batch, so a
    // rollback exercises exactly its `down`.
    const fix = await migrator().latest();
    expect(fix.executed).toEqual([ISSUER_MIGRATION]);

    const columns = manager.connection('main').schemaInspector;
    const schema = await columns.getPhysicalCollection({
      tableName: 'account',
    });
    const issuer = schema?.columns.find(
      (column) => column.columnName === 'issuer',
    );
    expect(issuer?.nullable).toBe(false);
    expect(issuer?.default?.value).toBe(DEFAULT_ISSUER);

    await insertAccountWithoutIssuer('acct-after', 'user-after');
    const stored = await manager
      .query('main')
      .selectFrom('account')
      .select(['issuer', 'accountId'])
      .where('id', '=', 'acct-after')
      .executeTakeFirst();
    expect(stored?.issuer).toBe(DEFAULT_ISSUER);

    const rollback = await migrator().rollback();
    expect(rollback.rolledBack).toEqual([ISSUER_MIGRATION]);

    const rolledBack = await columns.getPhysicalCollection({
      tableName: 'account',
    });
    const rolledBackIssuer = rolledBack?.columns.find(
      (column) => column.columnName === 'issuer',
    );
    expect(rolledBackIssuer?.nullable).toBe(false);
    expect(rolledBackIssuer?.default).toBeUndefined();
  });

  it('applies after the plugin migration creates the account table', async () => {
    const result = await migrator().latest();
    expect(result.executed).toEqual(
      expect.arrayContaining([ACCOUNT_TABLE_MIGRATION, ISSUER_MIGRATION]),
    );
    expect(result.executed.indexOf(ACCOUNT_TABLE_MIGRATION)).toBeLessThan(
      result.executed.indexOf(ISSUER_MIGRATION),
    );
  });
});
