import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationDefinition,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migrationDefinition from '../database/main/migrations/202609090004_relax_account_issuer_nullable.js';

const MIGRATION_NAME = '202609090004_relax_account_issuer_nullable';

/**
 * Regression coverage for the factory-verification failure: normal-user
 * registration returned HTTP 500 with `SQLITE_CONSTRAINT_NOTNULL (NOT
 * NULL constraint failed: account.issuer)`. The bundled better-auth no
 * longer writes `issuer` on the sign-up path, so the plugin's NOT-NULL
 * `account.issuer` column had to be relaxed — while admin add-user still
 * writes `issuer: 'local:credential'`.
 */
describe('account.issuer nullability repair migration', () => {
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

  /** Replicates the authentication plugin's `account` table definition. */
  async function createAccountTableAsPlugin(): Promise<void> {
    await manager.builder('main').createCollection('account', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('issuer', { length: 255 }).notNull();
      collection.string('accountId', { length: 320 }).notNull();
      collection.string('providerId', { length: 128 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.text('accessToken').nullable();
      collection.text('refreshToken').nullable();
      collection.text('idToken').nullable();
      collection.datetime('accessTokenExpiresAt').nullable();
      collection.datetime('refreshTokenExpiresAt').nullable();
      collection.text('scope').nullable();
      collection.text('password').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_account' });
      collection.unique(['issuer', 'accountId'], {
        name: 'uq_account_issuer_account',
      });
      collection.index('userId', { name: 'idx_account_user' });
    });
  }

  function migrationUp(): Promise<void> {
    return (migrationDefinition as MigrationDefinition).up({
      builder: manager.builder('main'),
    } as never);
  }

  async function issuerField(): Promise<
    { nullable: boolean; nativeType: string } | undefined
  > {
    const physical = await manager
      .connection('main')
      .collections.getPhysical('account');
    const column = physical?.columns?.find(
      (column) => column.columnName === 'issuer',
    );
    if (!column) return undefined;
    return { nullable: column.nullable, nativeType: column.nativeType };
  }

  it('is a no-op when the plugin account collection is absent (app-only DBs)', async () => {
    await migrationUp();
    expect(await manager.builder('main').hasCollection('account')).toBe(false);
  });

  it('relaxes account.issuer to nullable and lets better-auth sign-up inserts pass', async () => {
    await createAccountTableAsPlugin();
    await migrationUp();

    const field = await issuerField();
    expect(field?.nativeType).toBe('varchar(255)');
    expect(field?.nullable).toBe(true);

    const knex = await manager.connection('main').client();
    const now = new Date().toISOString();
    // better-auth's sign-up inserts the credential account without issuer.
    await knex.raw(
      `INSERT INTO account (id, issuer, account_id, provider_id, user_id, created_at, updated_at)
       VALUES (?, NULL, ?, 'credential', ?, ?, ?)`,
      ['acct-1', 'user-1', 'user-1', now, now],
    );
    // A second NULL-issuer account must not collide on the unique index.
    await knex.raw(
      `INSERT INTO account (id, issuer, account_id, provider_id, user_id, created_at, updated_at)
       VALUES (?, NULL, ?, 'credential', ?, ?, ?)`,
      ['acct-2', 'user-2', 'user-2', now, now],
    );
    // Admin add-user still writes an explicit issuer.
    await knex.raw(
      `INSERT INTO account (id, issuer, account_id, provider_id, user_id, created_at, updated_at)
       VALUES (?, 'local:credential', ?, 'credential', ?, ?, ?)`,
      ['acct-3', 'user-3', 'user-3', now, now],
    );

    const rows = await knex.raw(`SELECT issuer FROM account ORDER BY id`);
    expect(
      rows.map((row: { issuer: string | null }) => row.issuer).sort(),
    ).toEqual(['local:credential', null, null]);

    expect(MIGRATION_NAME).toBe(
      (migrationDefinition as MigrationDefinition).name,
    );
  });
});
