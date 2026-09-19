// @vitest-environment node
import path from 'node:path';

import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { createAuthentication } from '@nocobase/app-plugin-authentication/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import authConfig from '../../server/config/auth.js';

/**
 * The authentication schema stores `account.issuer` as NOT NULL. This guards
 * the application configuration that supplies a default so public sign-up
 * keeps working — a regression here breaks registration, not just a route.
 */
describe('application authentication configuration', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const { default: plugin } =
      await import('@nocobase/app-plugin-authentication/server');
    await createMigrator({
      database,
      packageName: '@nocobase/app-plugin-authentication',
      directory: path.resolve(plugin.baseDir, plugin.database.migrations),
    }).latest();
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('registers a user through sign-up and stamps the credential issuer', async () => {
    const options = authConfig({} as never);
    const auth = createAuthentication({
      ...options,
      connection: database.connection(),
      secret: 'test-secret-at-least-32-characters-long',
    });

    const response = await auth.handler(
      new Request('http://localhost/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: '测试用户',
          email: 'sign-up-test@example.invalid',
          password: 'Password-12345!',
          username: 'signuptest',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const accounts = await database
      .query()
      .selectFrom('account')
      .select(['providerId', 'issuer'])
      .execute();
    expect(accounts).toEqual([
      { providerId: 'credential', issuer: 'local:credential' },
    ]);
  });
});
