// @vitest-environment node
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import createCustomers from '../../database/main/migrations/202609190001_create_sales_customers.js';
import createContacts from '../../database/main/migrations/202609190002_create_sales_contacts.js';
import createOpportunities from '../../database/main/migrations/202609190003_create_sales_opportunities.js';
import createFollowUps from '../../database/main/migrations/202609190004_create_sales_followups.js';
import createFiles from '../../database/main/migrations/202609190005_create_sales_files.js';
import defaultAccountIssuer from '../../database/main/migrations/202609190006_default_account_issuer.js';

const migrations = [
  createCustomers,
  createContacts,
  createOpportunities,
  createFollowUps,
  createFiles,
];

const TABLES = [
  'sales_customers',
  'sales_contacts',
  'sales_opportunities',
  'sales_follow_ups',
  'sales_files',
];

describe('sales migrations', () => {
  let database: DatabaseManager;

  beforeEach(() => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function migrateUp(): Promise<void> {
    const connection = database.connection();
    for (const migration of migrations) {
      await migration.up({
        builder: connection.builder,
        query: connection.query,
        connection: connection as never,
      });
    }
  }

  async function migrateDown(): Promise<void> {
    const connection = database.connection();
    for (const migration of [...migrations].reverse()) {
      await migration.down?.({
        builder: connection.builder,
        query: connection.query,
        connection: connection as never,
      });
    }
  }

  function client(): Promise<Knex> {
    return database.connection().client<Knex>();
  }

  it('creates every table, column and index, then removes them on down', async () => {
    await migrateUp();
    const knex = await client();

    for (const table of TABLES) {
      expect(await knex.schema.hasTable(table)).toBe(true);
    }

    const columns: Record<string, string[]> = {
      sales_customers: [
        'id',
        'name',
        'industry',
        'source',
        'importance',
        'status',
        'owner_id',
        'phone',
        'email',
        'notes',
        'avatar_file_id',
        'created_by_id',
        'created_at',
        'updated_at',
      ],
      sales_contacts: [
        'id',
        'customer_id',
        'name',
        'title',
        'phone',
        'email',
        'is_primary',
        'created_at',
        'updated_at',
      ],
      sales_opportunities: [
        'id',
        'customer_id',
        'name',
        'amount',
        'expected_close_date',
        'stage',
        'close_reason',
        'owner_id',
        'created_by_id',
        'created_at',
        'updated_at',
      ],
      sales_follow_ups: [
        'id',
        'customer_id',
        'opportunity_id',
        'channel',
        'content',
        'occurred_at',
        'next_follow_up_at',
        'created_by_id',
        'created_at',
        'updated_at',
      ],
      sales_files: [
        'id',
        'disk',
        'key',
        'filename',
        'ext',
        'mime_type',
        'size',
        'created_at',
        'updated_at',
        'customer_id',
        'opportunity_id',
        'follow_up_id',
        'category',
        'uploaded_by_id',
        'uploaded_by_name',
      ],
    };

    for (const [table, expected] of Object.entries(columns)) {
      for (const column of expected) {
        expect(
          await knex.schema.hasColumn(table, column),
          `${table}.${column}`,
        ).toBe(true);
      }
    }

    const indexes = await knex.raw<{ name: string }[]>(
      "select name from sqlite_master where type = 'index' and name not like 'sqlite_%'",
    );
    const names = indexes.map((row) => row.name);
    const hasIndex = (table: string, column: string): boolean =>
      names.some(
        (name) => name.startsWith(`idx_${table}`) && name.includes(column),
      );
    expect(hasIndex('sales_customers', 'owner')).toBe(true);
    expect(hasIndex('sales_opportunities', 'stage')).toBe(true);
    expect(hasIndex('sales_follow_ups', 'next_follow_up_at')).toBe(true);
    expect(hasIndex('sales_files', 'customer')).toBe(true);

    await migrateDown();
    for (const table of TABLES) {
      expect(await knex.schema.hasTable(table)).toBe(false);
    }
  });

  it('defines sales_files so the file plugin accepts it for upload', async () => {
    await migrateUp();
    const manager = new ServerFileRepositoryManager(database, {} as never);
    const repository = manager.repository('salesFiles', {
      connection: 'main',
      disk: 'local',
      accessPath: '/uploads/sales-files',
      policy: { read: true, create: true, update: false, delete: false },
    });
    await expect(repository.validateCollection()).resolves.toBeUndefined();
  });

  it('gives account.issuer a default so public registration can insert', async () => {
    const connection = database.connection();
    // The shape the authentication plugin creates: issuer is NOT NULL, no default.
    await connection.builder.createCollection('account', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('issuer', { length: 255 }).notNull();
      collection.string('accountId', { length: 320 }).notNull();
      collection.string('providerId', { length: 128 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.text('password').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id');
    });

    await defaultAccountIssuer.up({
      builder: connection.builder,
      query: connection.query,
      connection: connection as never,
    });

    // Insert exactly what better-auth's credential sign-up inserts: no issuer.
    await expect(
      connection.query
        .insertInto('account')
        .values({
          id: 'acct-1',
          accountId: 'user-1',
          providerId: 'credential',
          userId: 'user-1',
          password: 'hash',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute(),
    ).resolves.toBeDefined();

    const row = await connection.query
      .selectFrom('account')
      .select('issuer')
      .where('id', '=', 'acct-1')
      .executeTakeFirstOrThrow();
    expect(row.issuer).toBe('local:credential');
  });
});
