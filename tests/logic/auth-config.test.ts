// @vitest-environment node
import { describe, expect, it } from 'vitest';

import authConfig from '../../server/config/auth.js';

/**
 * The authentication schema declares `account.issuer` as NOT NULL, but Better
 * Auth's email sign-up path does not send it. The application config must stamp
 * the locally stored issuer before the row is written, otherwise registration
 * fails with a database constraint error.
 */
describe('auth database hooks', () => {
  it('stamps the local credential issuer when sign-up omits one', async () => {
    const config = authConfig({} as never);
    const before = config.databaseHooks?.account?.create?.before;
    expect(before).toBeTypeOf('function');

    const result = await before!(
      {
        id: 'account-1',
        accountId: 'user-1',
        providerId: 'credential',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
      null,
    );
    expect(result).toMatchObject({
      data: { issuer: 'local:credential' },
    });
  });

  it('keeps an issuer that the caller already supplied', async () => {
    const config = authConfig({} as never);
    const before = config.databaseHooks?.account?.create?.before;
    const result = await before!(
      {
        id: 'account-2',
        accountId: 'user-2',
        providerId: 'google',
        userId: 'user-2',
        issuer: 'https://accounts.google.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
      null,
    );
    expect(result).toBeUndefined();
  });
});
