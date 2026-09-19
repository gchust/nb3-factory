// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAuthentication } from '@nocobase/app-plugin-authentication/server';
import type { DatabaseManager } from '@nocobase/db';

import authConfig from '../../server/config/auth.js';
import {
  createAuthenticationTables,
  createTestDatabase,
} from '../helpers/expense-database.js';

/**
 * User creation must write a credential account row with the required
 * `account.issuer` value. Better Auth's account model has no `issuer` field of
 * its own, so the application declares it in `server/config/auth.ts`; without
 * that declaration the insert omits the column and the NOT NULL constraint
 * fails, breaking both sign-up and User management.
 */
describe('authentication account creation', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createTestDatabase();
    await createAuthenticationTables(database);
  });

  afterEach(async () => {
    await database.destroy();
  });

  function createTestAuth() {
    return createAuthentication({
      connection: database.connection(),
      secret: 'test-auth-secret-at-least-32-characters',
      baseURL: 'http://localhost',
      basePath: '/api/auth',
      ...authConfig({} as never),
    });
  }

  it('creates an account with the local credential issuer on sign-up', async () => {
    const auth = createTestAuth();
    const response = await auth.handler(
      new Request('http://localhost/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'New Employee',
          username: 'newemployee',
          email: 'newemployee@example.com',
          password: 'Passw0rd!2345',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      user?: { id?: string };
    };
    expect(payload.user?.id).toBeTruthy();

    const account = await database
      .query()
      .selectFrom('account')
      .select(['issuer', 'providerId', 'accountId'])
      .where('providerId', '=', 'credential')
      .executeTakeFirst();
    expect(account).toMatchObject({
      issuer: 'local:credential',
      providerId: 'credential',
      accountId: payload.user?.id,
    });
  });
});
