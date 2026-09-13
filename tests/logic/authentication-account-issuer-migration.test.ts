import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '../support/database.js';

interface KnexRawClient {
  raw(sql: string, bindings?: readonly unknown[]): Promise<unknown>;
}

let testDatabase: TestDatabase;

beforeEach(async () => {
  testDatabase = await createTestDatabase();
});

afterEach(async () => {
  await testDatabase.cleanup();
});

/**
 * The authentication plugin creates `account.issuer` as NOT NULL, but Better
 * Auth's credential sign-up does not send the column. Without a database
 * default, `POST /api/auth/sign-up/email` fails with
 * `NOT NULL constraint failed: account.issuer` and returns HTTP 500.
 */
describe('202609130004_default_account_issuer', () => {
  it('lets an account row be inserted without an issuer', async () => {
    await createAuthenticationAccountTable(testDatabase);
    await testDatabase.migrate();

    const connection = await testDatabase.database.connect();
    const client = await connection.client<KnexRawClient>();
    await client.raw(
      'insert into account (id, account_id, provider_id, user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
      ['account-1', 'user-1', 'credential', 'user-1', Date.now(), Date.now()],
    );

    const row = await testDatabase.database
      .query()
      .selectFrom('account')
      .select(['issuer', 'accountId'])
      .executeTakeFirst();
    expect(row?.issuer).toBe('local:credential');
    expect(row?.accountId).toBe('user-1');
  });

  it('removes the default again on rollback', async () => {
    await createAuthenticationAccountTable(testDatabase);
    await testDatabase.migrate();
    await testDatabase.rollback();

    const connection = await testDatabase.database.connect();
    const client = await connection.client<KnexRawClient>();
    await expect(
      client.raw(
        'insert into account (id, account_id, provider_id, user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
        ['account-2', 'user-2', 'credential', 'user-2', Date.now(), Date.now()],
      ),
    ).rejects.toThrow(/NOT NULL constraint failed/i);
  });
});

async function createAuthenticationAccountTable(
  testDatabase: TestDatabase,
): Promise<void> {
  const connection = await testDatabase.database.connect();
  const client = await connection.client<KnexRawClient>();
  await client.raw(
    [
      'create table account (',
      'id varchar(64) not null,',
      'issuer varchar(255) not null,',
      'account_id varchar(320) not null,',
      'provider_id varchar(128) not null,',
      'user_id varchar(64) not null,',
      'created_at datetime not null,',
      'updated_at datetime not null,',
      'primary key (id)',
      ')',
    ].join(' '),
  );
}
