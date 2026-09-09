import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createAppMigrator } from '@nocobase/app-server/database';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const migrationsDirectory = path.resolve(
  import.meta.dirname,
  '../../database/migrations',
);

// The authentication plugin owns the `account` table; its migration lives in
// the plugin package, so include it as a migration source alongside the
// application's own migrations.
const authenticationMigrationsDirectory = path.dirname(
  require.resolve('@nocobase/app-plugin-authentication/package.json'),
);

describe('account issuer migration', () => {
  let database: DatabaseManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'account-issuer-migration-'));
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: path.join(tempDir, 'test.sqlite'),
        },
      },
    });
    await database.connect();
  });

  afterEach(async () => {
    await database.destroy();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createMigrator() {
    return createAppMigrator({
      database,
      sources: [
        { packageName: 'nb3-factory', directory: migrationsDirectory },
        {
          packageName: '@nocobase/app-plugin-authentication',
          directory: path.join(
            authenticationMigrationsDirectory,
            'dist/database/migrations',
          ),
        },
      ],
      config: {
        packageName: 'nb3-factory',
        autoRun: true,
      },
    });
  }

  it('makes account.issuer nullable so credential sign-up can insert', async () => {
    const result = await createMigrator().latest();
    expect(result.status).toBe('completed');
    expect(result.executed).toContain('202609090003_allow_null_account_issuer');

    const schema = await database
      .connection()
      .schemaInspector.getPhysicalCollection({ tableName: 'account' });
    expect(schema).toBeDefined();

    const issuer = schema!.columns.find(
      (column) => column.columnName === 'issuer',
    );
    expect(issuer).toBeDefined();
    expect(issuer!.nullable).toBe(true);

    // better-auth's email/password sign-up links a credential account without
    // an issuer; the insert must now succeed.
    await database
      .query()
      .insertInto('account')
      .values({
        id: 'acc-credential-1',
        accountId: 'user-1',
        providerId: 'credential',
        userId: 'user-1',
        password: 'hashed',
        createdAt: '2026-09-09T00:00:00.000Z',
        updatedAt: '2026-09-09T00:00:00.000Z',
      })
      .execute();

    // OAuth accounts still set an issuer, and the unique index keeps them unique.
    await database
      .query()
      .insertInto('account')
      .values({
        id: 'acc-oauth-1',
        issuer: 'https://example.com',
        accountId: 'oauth-subject-1',
        providerId: 'oauth',
        userId: 'user-2',
        createdAt: '2026-09-09T00:00:00.000Z',
        updatedAt: '2026-09-09T00:00:00.000Z',
      })
      .execute();
  });

  it('down restores issuer to NOT NULL', async () => {
    const migrator = createMigrator();
    await migrator.latest();

    // A full batch rollback would also drop the `account` table (the
    // authentication plugin's own down), so invoke this migration's `down`
    // directly to verify it restores the NOT NULL constraint.
    const connection = database.connection();
    const migration = (
      await import('../../database/migrations/202609090003_allow_null_account_issuer.ts')
    ).default;
    await migration.down({
      builder: connection.builder,
      query: connection.query,
      connection: {
        name: connection.name,
        driver: connection.driver,
        dialect: connection.dialect,
        capabilities: connection.capabilities,
        client: connection.client.bind(connection),
      },
    });

    const schema = await database
      .connection()
      .schemaInspector.getPhysicalCollection({ tableName: 'account' });
    expect(schema).toBeDefined();
    const issuer = schema!.columns.find(
      (column) => column.columnName === 'issuer',
    );
    expect(issuer).toBeDefined();
    expect(issuer!.nullable).toBe(false);
  });
});
