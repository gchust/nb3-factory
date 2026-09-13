import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationContext,
} from '@nocobase/db';
import { afterEach, describe, expect, it } from 'vitest';

import accountIssuer from '../../database/main/migrations/202609130006_default_account_issuer.js';

async function createAccountDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: ':memory:',
        schemaManagement: 'managed',
      },
    },
  });
  await database.connect();
  // The Authentication plugin's own shape, including the NOT NULL issuer
  // column that better-auth's sign-up does not populate.
  await database.builder().createCollection('account', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('issuer', { length: 255 }).notNull();
    collection.string('accountId', { length: 320 }).notNull();
    collection.string('providerId', { length: 128 }).notNull();
    collection.string('userId', { length: 64 }).notNull();
    collection.text('password').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id');
    collection.unique(['issuer', 'accountId']);
  });
  return database;
}

function context(database: DatabaseManager): MigrationContext {
  return {
    builder: database.builder(),
    query: database.query(),
    connection: database.connection(),
  } as unknown as MigrationContext;
}

describe('account issuer migration', () => {
  let database: DatabaseManager | undefined;

  afterEach(async () => {
    await database?.destroy();
    database = undefined;
  });

  it('lets a credential account be created without an explicit issuer', async () => {
    database = await createAccountDatabase();
    const insert = (id: string) =>
      database
        ?.query()
        .insertInto('account')
        .values({
          id,
          accountId: id,
          providerId: 'credential',
          userId: id,
          password: 'hash',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();

    await expect(insert('before')).rejects.toThrow();
    await accountIssuer.up(context(database));
    await insert('after');

    const row = await database
      .query()
      .selectFrom('account')
      .selectAll()
      .where('id', '=', 'after')
      .executeTakeFirst();
    expect(row?.issuer).toBe('local:credential');

    const down = migrationDown();
    await down(context(database));
    await expect(insert('reverted')).rejects.toThrow();
  });
});

function migrationDown(): (context: MigrationContext) => Promise<void> {
  const down = accountIssuer.down;
  if (!down)
    throw new Error('The account issuer migration must be reversible.');
  return (context) => down(context);
}
