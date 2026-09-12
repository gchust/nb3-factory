import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createDatabaseManager,
  type DatabaseManager,
  type DatabaseMigrator,
} from '@nocobase/db';

const require = createRequire(import.meta.url);

const AUTH_MIGRATIONS_DIRECTORY = path.join(
  path.dirname(
    require.resolve('@nocobase/app-plugin-authentication/package.json'),
  ),
  'dist',
  'database',
  'migrations',
);
const APP_MIGRATIONS_DIRECTORY = path.resolve(
  process.cwd(),
  'database/main/migrations',
);

function createDatabase(): DatabaseManager {
  return createDatabaseManager({
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: ':memory:' },
    },
  });
}

describe('self-service sign-up account issuer', () => {
  let database: DatabaseManager;
  let appMigrator: DatabaseMigrator;

  beforeEach(async () => {
    database = createDatabase();
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('relaxes account.issuer to nullable so better-auth sign-up inserts succeed, and down restores NOT NULL', async () => {
    const connection = database.connection('main');

    // 1. The authentication plugin creates `account.issuer` NOT NULL.
    await database
      .createMigrator({
        sources: [
          {
            packageName: 'authentication',
            directory: AUTH_MIGRATIONS_DIRECTORY,
          },
        ],
      })
      .latest();
    const before = await connection.schemaInspector.getPhysicalCollection({
      tableName: 'account',
    });
    expect(
      before?.columns.find((column) => column.columnName === 'issuer'),
    ).toMatchObject({ nullable: false });

    // 2. The application migration makes it nullable.
    appMigrator = database.createMigrator({
      directory: APP_MIGRATIONS_DIRECTORY,
    });
    await appMigrator.latest();
    const after = await connection.schemaInspector.getPhysicalCollection({
      tableName: 'account',
    });
    expect(
      after?.columns.find((column) => column.columnName === 'issuer'),
    ).toMatchObject({ nullable: true });

    // 3. Better Auth's exact sign-up shape — no issuer — now inserts.
    //    (The physical columns are snake_case under the default naming.)
    const now = new Date().toISOString();
    const knex = await connection.client();
    await knex.raw(
      'INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        'test-account-id',
        'test-account-id',
        'credential',
        'test-account-id',
        'hashed',
        now,
        now,
      ],
    );
    expect(
      (
        await knex.raw(
          'SELECT count(*) AS count FROM "account" WHERE "id" = ?',
          ['test-account-id'],
        )
      )[0].count,
    ).toBe(1);

    // 4. Rolling back restores NOT NULL. The reverse is documented as only
    //    safe while no NULL-issuer rows exist, so drop the registration
    //    first — mirroring a rollback before any self-service sign-ups.
    await knex.raw('DELETE FROM "account" WHERE "id" = ?', ['test-account-id']);
    const rolledBack = await appMigrator.rollback();
    expect(rolledBack.rolledBack).toContain(
      '202609120004_relax_account_issuer_nullable',
    );
    const restored = await connection.schemaInspector.getPhysicalCollection({
      tableName: 'account',
    });
    expect(
      restored?.columns.find((column) => column.columnName === 'issuer'),
    ).toMatchObject({ nullable: false });
  });
});
