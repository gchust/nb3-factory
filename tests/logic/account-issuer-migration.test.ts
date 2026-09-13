// @vitest-environment node
import { createDatabaseManager, type MigrationContext } from '@nocobase/db';
import { afterAll, describe, expect, it } from 'vitest';

import relaxAccountIssuer from '../../database/main/migrations/202609130004_relax_account_issuer.js';

interface SchemaClient {
  readonly schema: {
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

const database = createDatabaseManager({
  default: 'main',
  connections: {
    main: { dialect: 'sqlite', filename: ':memory:' },
  },
});

afterAll(async () => {
  await database.destroy();
});

function context(): MigrationContext {
  return {
    builder: database.builder('main'),
    query: database.query('main'),
    connection: {
      name: 'main',
      driver: 'sqlite',
      dialect: 'sqlite',
      capabilities: {},
    },
  } as unknown as MigrationContext;
}

/** The authentication plugin creates `account.issuer` as NOT NULL; reproduce that shape. */
async function createLegacyAccountTable(): Promise<void> {
  await database.builder('main').createCollection('account', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('issuer', { length: 255 }).notNull();
    collection.string('accountId', { length: 320 }).notNull();
    collection.string('providerId', { length: 128 }).notNull();
    collection.string('userId', { length: 64 }).notNull();
    collection.primary('id', { name: 'pk_account' });
    collection.unique(['issuer', 'accountId'], {
      name: 'uq_account_issuer_account',
    });
  });
}

function insertWithoutIssuer(id: string) {
  return database
    .query('main')
    .insertInto('account')
    .values({ id, accountId: id, providerId: 'credential', userId: id })
    .execute();
}

describe('relax account issuer migration', () => {
  it('allows credential accounts to be inserted without an issuer and is reversible', async () => {
    await createLegacyAccountTable();
    const query = database.query('main');

    // A row that predates the change, written by the plugin's admin seed.
    await query
      .insertInto('account')
      .values({
        id: 'legacy',
        issuer: 'local:credential',
        accountId: 'legacy',
        providerId: 'credential',
        userId: 'legacy',
      })
      .execute();

    // Before the repair Better Auth's issuer-less insert is rejected.
    await expect(insertWithoutIssuer('before')).rejects.toThrow(/issuer/i);

    await relaxAccountIssuer.up(context());

    const connection = await database.connection('main');
    const client = await connection.client<SchemaClient>();
    expect(await client.schema.hasColumn('account', 'issuer')).toBe(true);

    // Better Auth 1.7.3 inserts an account without issuer; this is the operation that
    // used to fail with NOT NULL constraint failed.
    await insertWithoutIssuer('signup');

    const rows = await query
      .selectFrom('account')
      .select(['id', 'issuer'])
      .orderBy('id')
      .execute();
    expect(rows).toEqual([
      { id: 'legacy', issuer: 'local:credential' },
      { id: 'signup', issuer: null },
    ]);

    await relaxAccountIssuer.down?.(context());

    // Down restores the constraint and backfills the rows it would reject.
    const backfilled = await query
      .selectFrom('account')
      .select(['id', 'issuer'])
      .where('id', '=', 'signup')
      .executeTakeFirstOrThrow();
    expect(backfilled.issuer).toBe('local:credential');
    await expect(insertWithoutIssuer('after')).rejects.toThrow(/issuer/i);

    // The credential account that predates the migration keeps its issuer.
    const legacy = await query
      .selectFrom('account')
      .select(['id', 'issuer'])
      .where('id', '=', 'legacy')
      .executeTakeFirstOrThrow();
    expect(legacy.issuer).toBe('local:credential');
  });
});
