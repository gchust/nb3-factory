// @vitest-environment node

import { createAuthentication } from '@nocobase/app-plugin-authentication/server';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import authConfig from '../../server/config/auth.js';

/**
 * Regression guard for the `account.issuer` NOT NULL constraint.
 *
 * Better Auth's own account schema has no `issuer` column, so unless the
 * application config declares it as an additional field the database adapter
 * strips it and every credential account insert fails with
 * `SQLITE_CONSTRAINT_NOTNULL`. Both sign-up and the admin user-creation service
 * go through this adapter.
 */
describe('authentication account issuer', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    await createIdentityTables(database);
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('writes the credential account with an issuer', async () => {
    const connection = database.connection();
    const auth = createAuthentication({
      ...authConfig({} as never),
      connection,
      secret: 'test-auth-secret-at-least-32-characters',
    });

    const response = await auth.handler(
      new Request('http://localhost/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: '测试用户',
          username: 'test.user',
          email: 'test.user@example.com',
          password: 'Train@2026',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const account = await connection.query
      .selectFrom('account')
      .select(['issuer', 'providerId'])
      .where('providerId', '=', 'credential')
      .executeTakeFirstOrThrow();
    expect(account.issuer).toBe('local:credential');
  });
});

async function createIdentityTables(database: DatabaseManager): Promise<void> {
  const { builder } = database.connection();
  await builder.createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.string('name', { length: 255 }).notNull();
    collection.string('username', { length: 255 }).nullable();
    collection.string('email', { length: 320 }).notNull();
    collection.boolean('emailVerified').notNull().defaultTo(false);
    collection.text('image').nullable();
    collection.datetime('disabledAt').nullable();
    collection.datetime('deletedAt').nullable();
    collection.string('deletedBy', { length: 64 }).nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
  });
  await builder.createCollection('session', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.datetime('expiresAt').notNull();
    collection.string('token', { length: 255 }).notNull();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.string('ipAddress', { length: 128 }).nullable();
    collection.text('userAgent').nullable();
    collection.string('userId', { length: 64 }).notNull();
  });
  await builder.createCollection('account', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    // The plugin migration declares this NOT NULL without a default, which is
    // exactly the constraint this test protects.
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
    collection.unique(['issuer', 'accountId'], {
      name: 'uq_account_issuer_account',
    });
  });
  await builder.createCollection('verification', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.string('identifier', { length: 320 }).notNull();
    collection.text('value').notNull();
    collection.datetime('expiresAt').notNull();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
  });
}
