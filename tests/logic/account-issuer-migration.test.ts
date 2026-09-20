import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609200002_default_account_issuer.js';

describe('account issuer default migration', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
    const connection = database.connection();
    // The authentication migration's account table: issuer is NOT NULL with no default.
    await connection.builder.createCollection('account', (collection) => {
      collection.string('id', { length: 64 }).notNull().primary();
      collection.string('issuer', { length: 255 }).notNull();
      collection.string('accountId', { length: 320 }).notNull();
      collection.string('providerId', { length: 128 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.text('password').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  function insertCredentialAccount(): Promise<unknown> {
    const now = new Date();
    return database
      .query()
      .insertInto('account')
      .values({
        id: 'account-1',
        accountId: 'user-1',
        providerId: 'credential',
        userId: 'user-1',
        password: 'hash',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  it('lets a credential account be created without an explicit issuer', async () => {
    // Without the default, better-auth's own sign-up insert violates the NOT NULL constraint.
    await expect(insertCredentialAccount()).rejects.toThrow(/issuer/);

    const connection = database.connection();
    await migration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });

    await expect(insertCredentialAccount()).resolves.toBeDefined();
    const row = await database
      .query()
      .selectFrom('account')
      .select('issuer')
      .where('id', '=', 'account-1')
      .executeTakeFirst();
    expect(row?.issuer).toBe('local:credential');
  });

  it('reverses without error', async () => {
    const connection = database.connection();
    await migration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    await expect(
      migration.down?.({
        builder: connection.builder,
        query: connection.query,
        connection,
      }),
    ).resolves.toBeUndefined();
  });
});
