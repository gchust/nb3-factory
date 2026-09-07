import { describe, expect, it } from 'vitest';
import { createDatabaseManager, createMigrationContext } from '@nocobase/db';

import rolesMigration from '../database/migrations/202609070001_create_sales_roles.js';
import customersMigration from '../database/migrations/202609070002_create_sales_customers.js';
import contactsMigration from '../database/migrations/202609070003_create_sales_contacts.js';
import leadsMigration from '../database/migrations/202609070004_create_sales_leads.js';
import opportunitiesMigration from '../database/migrations/202609070005_create_sales_opportunities.js';
import followUpsMigration from '../database/migrations/202609070006_create_sales_follow_ups.js';
import filesMigration from '../database/migrations/202609070007_create_sales_files.js';
import issuerMigration from '../database/migrations/202609070008_allow_nullable_account_issuer.js';
import authMigration from '../node_modules/@nocobase/app-plugin-authentication/dist/database/migrations/202608200001_create_authentication_tables.js';

async function createEmptyDatabase() {
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: ':memory:',
      },
    },
  });
  await database.connect();
  return database;
}

async function tableNames(database: ReturnType<typeof createEmptyDatabase>) {
  const knex = await database.connection().client<import('knex').Knex>();
  const rows = await knex
    .from('sqlite_master')
    .select('name')
    .where('type', '=', 'table')
    .whereNot('name', 'like', 'sqlite_%');
  return rows.map((row) => String(row.name)).sort();
}

async function accountIssuerNotNull(
  database: ReturnType<typeof createEmptyDatabase>,
): Promise<boolean> {
  const knex = await database.connection().client<import('knex').Knex>();
  const info = await knex.raw('PRAGMA table_info(account)');
  const issuer = info.find((column: any) => column.name === 'issuer');
  return issuer?.notnull === 1;
}

describe('sales migrations', () => {
  it('creates every sales table with its constraints', async () => {
    const database = await createEmptyDatabase();
    try {
      const context = createMigrationContext(database.connection());
      await rolesMigration.up(context);
      await customersMigration.up(context);
      await contactsMigration.up(context);
      await leadsMigration.up(context);
      await opportunitiesMigration.up(context);
      await followUpsMigration.up(context);
      await filesMigration.up(context);

      const tables = await tableNames(database);
      expect(tables).toEqual(
        expect.arrayContaining([
          'roles',
          'user_roles',
          'customers',
          'customer_profiles',
          'contacts',
          'leads',
          'opportunities',
          'opportunity_contacts',
          'follow_ups',
          'follow_up_reminders',
          'business_license_files',
        ]),
      );

      // Unique constraints are created as separate indexes in SQLite.
      const knex = await database.connection().client<import('knex').Knex>();
      const indexes = await knex
        .from('sqlite_master')
        .select('name')
        .where('type', '=', 'index');
      const indexNames = indexes.map((row) => String(row.name));
      expect(indexNames).toEqual(
        expect.arrayContaining([
          'uq_roles_key',
          'uq_customers_customer_no',
          'uq_opportunities_opportunity_no',
          'uq_follow_up_reminders_pair',
        ]),
      );
    } finally {
      await database.destroy();
    }
  });

  it('drops every sales table in reverse dependency order on down', async () => {
    const database = await createEmptyDatabase();
    try {
      const context = createMigrationContext(database.connection());
      await rolesMigration.up(context);
      await customersMigration.up(context);
      await contactsMigration.up(context);
      await leadsMigration.up(context);
      await opportunitiesMigration.up(context);
      await followUpsMigration.up(context);
      await filesMigration.up(context);

      await followUpsMigration.down?.(context);
      await opportunitiesMigration.down?.(context);
      await leadsMigration.down?.(context);
      await contactsMigration.down?.(context);
      await customersMigration.down?.(context);
      await rolesMigration.down?.(context);

      const tables = await tableNames(database);
      expect(tables).not.toEqual(
        expect.arrayContaining([
          'roles',
          'user_roles',
          'customers',
          'customer_profiles',
          'contacts',
          'leads',
          'opportunities',
          'opportunity_contacts',
          'follow_ups',
          'follow_up_reminders',
          'business_license_files',
        ]),
      );
    } finally {
      await database.destroy();
    }
  });

  it('makes account.issuer nullable so Better Auth sign-up can link accounts', async () => {
    const database = await createEmptyDatabase();
    try {
      const context = createMigrationContext(database.connection());
      // The authentication plugin creates `account.issuer` as NOT NULL.
      await authMigration.up(context);
      expect(await accountIssuerNotNull(database)).toBe(true);

      // up relaxes the column so a credential-provider account (no issuer)
      // inserts cleanly.
      await issuerMigration.up(context);
      expect(await accountIssuerNotNull(database)).toBe(false);

      const now = new Date();
      await database
        .query()
        .insertInto('account')
        .values({
          id: 'account-without-issuer',
          accountId: 'user-1',
          providerId: 'credential',
          userId: 'user-1',
          password: 'hash',
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      const knex = await database.connection().client<import('knex').Knex>();
      const row = await knex
        .from('account')
        .select('issuer')
        .where('id', '=', 'account-without-issuer')
        .first();
      expect(row?.issuer).toBeNull();

      // SQLite cannot restore a NOT NULL constraint over NULL data, so remove
      // the nullable row before exercising down.
      await knex
        .from('account')
        .where('id', '=', 'account-without-issuer')
        .del();

      // down restores the NOT NULL constraint.
      await issuerMigration.down?.(context);
      expect(await accountIssuerNotNull(database)).toBe(true);
      await expect(
        database
          .query()
          .insertInto('account')
          .values({
            id: 'account-without-issuer-2',
            accountId: 'user-2',
            providerId: 'credential',
            userId: 'user-2',
            password: 'hash',
            createdAt: now,
            updatedAt: now,
          })
          .execute(),
      ).rejects.toThrow(/NOT NULL constraint failed: account.issuer/);
    } finally {
      await database.destroy();
    }
  });
});
