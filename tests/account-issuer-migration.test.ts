import type { DatabaseManager } from '@nocobase/db';
import { createMigrationContext } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import authMigration from '../node_modules/@nocobase/app-plugin-authentication/dist/database/migrations/202608200001_create_authentication_tables.js';
import issuerMigration from '../database/migrations/202609070001_allow_nullable_account_issuer.js';
import { createTestDatabase } from './helpers/asset-test-db.js';

async function issuerNotNull(database: DatabaseManager): Promise<number> {
  const knex = await database.connection().client();
  const info = (await knex.raw('PRAGMA table_info(account)')) as Array<{
    name: string;
    notnull: number;
  }>;
  return info.find((column) => column.name === 'issuer')?.notnull ?? -1;
}

describe('account issuer migration', () => {
  it('makes account.issuer nullable on up and accepts a NULL issuer insert', async () => {
    const { database } = await createTestDatabase();
    try {
      const context = createMigrationContext(database.connection());

      // The authentication plugin creates `issuer` as NOT NULL.
      await authMigration.up(context);
      expect(await issuerNotNull(database)).toBe(1);

      // The fix makes it nullable.
      await issuerMigration.up(context);
      expect(await issuerNotNull(database)).toBe(0);

      // A local credential account (better-auth 1.7.3) is inserted without
      // `issuer`; the insert must succeed and leave the column NULL.
      const knex = await database.connection().client();
      await knex('account').insert({
        id: 'account-1',
        account_id: 'account-1',
        provider_id: 'credential',
        user_id: 'user-1',
        password: 'hashed',
        created_at: new Date(),
        updated_at: new Date(),
      });
      const row = await knex('account')
        .select('issuer')
        .where('id', '=', 'account-1')
        .first();
      expect(row?.issuer).toBeNull();
    } finally {
      await database.destroy();
    }
  });

  it('restores the NOT NULL constraint on down while no NULL rows exist', async () => {
    const { database } = await createTestDatabase();
    try {
      const context = createMigrationContext(database.connection());
      await authMigration.up(context);
      await issuerMigration.up(context);
      await issuerMigration.down?.(context);
      expect(await issuerNotNull(database)).toBe(1);
    } finally {
      await database.destroy();
    }
  });
});
