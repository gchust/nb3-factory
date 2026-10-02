// @vitest-environment node

import {
  createAppDatabaseManager,
  resolveDatabaseConfig,
} from '@nocobase/app-server/database';
import { createAppPaths, type AppPaths } from '@nocobase/app-server/config';
import {
  emptyDatabaseTaskConfig,
  type DatabaseManager,
  type SeedContext,
} from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import crmSampleSeed from '../../database/main/seeds/20261001120001_crm_sample_data.ts';
import {
  CrmNotFoundError,
  CrmValidationError,
  createCrmService,
  type CrmService,
} from '../../server/providers/crm.ts';

const sourceRoot = path.resolve(import.meta.dirname, '../..');
const MIGRATIONS_DIR = path.join(sourceRoot, 'database/main/migrations');
const SEEDS_DIR = path.join(sourceRoot, 'database/main/seeds');
const CRM_MIGRATION = '20261001120000_create_crm_collections';
const CRM_SEED = '20261001120001_crm_sample_data';

interface CrmDatabase {
  readonly directory: string;
  readonly manager: DatabaseManager;
  readonly paths: AppPaths;
  readonly service: CrmService;
}

const databases: CrmDatabase[] = [];

/** A real SQLite database with the CRM migration and, by default, the sample seed applied. */
async function createCrmDatabase(
  options: { readonly seed?: boolean } = {},
): Promise<CrmDatabase> {
  const directory = mkdtempSync(path.join(tmpdir(), 'crm-database-'));
  const paths = createAppPaths({
    rootDir: sourceRoot,
    databaseDir: path.join(sourceRoot, 'database'),
    storageDir: directory,
  });
  const config = await resolveDatabaseConfig({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'database.sqlite'),
        schemaManagement: 'managed',
      },
    },
  });
  const manager = createAppDatabaseManager(config, paths);
  if (!manager) throw new Error('The test database manager was not created.');
  await manager.connect('main');

  await manager
    .createMigrator({ directory: MIGRATIONS_DIR, packageName: 'app' })
    .latest();
  if (options.seed !== false) {
    await manager
      .createSeeder({ directory: SEEDS_DIR, packageName: 'app' })
      .run();
  }

  const database: CrmDatabase = {
    directory,
    manager,
    paths,
    service: createCrmService(manager),
  };
  databases.push(database);
  return database;
}

async function tableNames(database: CrmDatabase): Promise<string[]> {
  const client = await database.manager.connection('main').client<Knex>();
  const names = await client('sqlite_master')
    .where({ type: 'table' })
    .pluck('name');
  return names as string[];
}

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      await database.manager.destroy();
      rmSync(database.directory, { recursive: true, force: true });
    }),
  );
});

describe('CRM schema migration', () => {
  it('creates the three collections and reverses them on rollback', async () => {
    const database = await createCrmDatabase({ seed: false });

    expect(await tableNames(database)).toEqual(
      expect.arrayContaining(['customers', 'contacts', 'opportunities']),
    );

    const migrator = database.manager.createMigrator({
      directory: MIGRATIONS_DIR,
      packageName: 'app',
    });
    const rollback = await migrator.rollback();

    expect(rollback.rolledBack).toContain(CRM_MIGRATION);
    const afterRollback = await tableNames(database);
    expect(afterRollback).not.toContain('customers');
    expect(afterRollback).not.toContain('contacts');
    expect(afterRollback).not.toContain('opportunities');
  });

  it('enforces the required fields and the non-negative amount', async () => {
    const database = await createCrmDatabase({ seed: false });
    const client = await database.manager.connection('main').client<Knex>();

    expect(await client.schema.hasColumn('customers', 'name')).toBe(true);
    expect(await client.schema.hasColumn('customers', 'industry')).toBe(true);
    expect(await client.schema.hasColumn('contacts', 'name')).toBe(true);
    expect(await client.schema.hasColumn('contacts', 'customer_id')).toBe(true);
    expect(await client.schema.hasColumn('opportunities', 'amount')).toBe(true);
    expect(await client.schema.hasColumn('opportunities', 'stage')).toBe(true);

    const customerColumns = await client.table('customers').columnInfo();
    expect(customerColumns.name?.nullable).toBe(false);
    expect(customerColumns.industry?.nullable).toBe(true);
    const contactColumns = await client.table('contacts').columnInfo();
    expect(contactColumns.customer_id?.nullable).toBe(false);
    const opportunityColumns = await client.table('opportunities').columnInfo();
    expect(opportunityColumns.amount?.nullable).toBe(false);
    expect(opportunityColumns.stage?.nullable).toBe(false);
  });
});

describe('CRM sample seed', () => {
  it('installs two customers, three contacts and three opportunities once', async () => {
    const database = await createCrmDatabase();

    await expect(
      database.manager
        .createSeeder({ directory: SEEDS_DIR, packageName: 'app' })
        .run(),
    ).resolves.toMatchObject({ executed: [], skipped: [CRM_SEED] });

    await expect(database.service.listCustomers()).resolves.toHaveLength(2);
    await expect(database.service.listContacts()).resolves.toHaveLength(3);
    await expect(database.service.listOpportunities()).resolves.toHaveLength(3);
  });

  it('adds nothing when run again against existing data', async () => {
    const database = await createCrmDatabase();
    const connection = database.manager.connection('main');

    const context: SeedContext = {
      config: emptyDatabaseTaskConfig,
      container: new ServiceContainer(),
      repository: (collection) => database.manager.repository(collection),
      query: database.manager.query('main'),
      connection: {
        name: connection.name,
        driver: connection.driver,
        dialect: connection.dialect,
        capabilities: connection.capabilities,
        client: () => connection.client(),
      },
    };

    await crmSampleSeed.run(context);
    await crmSampleSeed.run(context);

    await expect(database.service.listCustomers()).resolves.toHaveLength(2);
    await expect(database.service.listContacts()).resolves.toHaveLength(3);
    await expect(database.service.listOpportunities()).resolves.toHaveLength(3);
  });
});

describe('CRM service', () => {
  let database: CrmDatabase;

  beforeEach(async () => {
    database = await createCrmDatabase();
  });

  it('sums only the opportunities that belong to the customer', async () => {
    const customers = await database.service.listCustomers();
    const eastChina = customers.find(
      (customer) => customer.name === '华东制造',
    );
    const star = customers.find((customer) => customer.name === '星辰科技');
    if (!eastChina || !star) throw new Error('Sample customers are missing.');

    const detail = await database.service.getCustomer(eastChina.id);

    // 1,200,000 + 600,000; 星辰科技's 800,000 must not be included.
    expect(detail.amountTotal).toBe(1800000);
    expect(detail.contacts).toHaveLength(2);
    expect(detail.opportunities).toHaveLength(2);
    expect(
      detail.opportunities.every(
        (opportunity) => opportunity.customerId === eastChina.id,
      ),
    ).toBe(true);
    expect((await database.service.getCustomer(star.id)).amountTotal).toBe(
      800000,
    );
  });

  it('updates the sum when an opportunity amount changes', async () => {
    const star = (await database.service.listCustomers()).find(
      (customer) => customer.name === '星辰科技',
    );
    if (!star) throw new Error('The sample customer is missing.');

    const created = await database.service.createOpportunity({
      name: '追加预算',
      customerId: star.id,
      amount: 200000,
      stage: 'following',
    });
    await expect(database.service.getCustomer(star.id)).resolves.toMatchObject({
      amountTotal: 1000000,
    });

    await database.service.updateOpportunity(created.id, { amount: 250000 });
    await expect(database.service.getCustomer(star.id)).resolves.toMatchObject({
      amountTotal: 1050000,
    });

    const eastChina = (await database.service.listCustomers()).find(
      (customer) => customer.name === '华东制造',
    );
    if (!eastChina) throw new Error('The other sample customer is missing.');
    // Changing one customer's amount must not touch another customer's total.
    await expect(
      database.service.getCustomer(eastChina.id),
    ).resolves.toMatchObject({ amountTotal: 1800000 });
  });

  it('filters opportunities by stage and by customer', async () => {
    const won = await database.service.listOpportunities({ stage: 'won' });
    expect(won).toHaveLength(1);
    expect(won[0]?.name).toBe('智能仓储项目');

    const star = (await database.service.listCustomers()).find(
      (customer) => customer.name === '星辰科技',
    );
    if (!star) throw new Error('The sample customer is missing.');
    const starOpportunities = await database.service.listOpportunities({
      customerId: star.id,
    });
    expect(starOpportunities).toHaveLength(1);
    expect(starOpportunities[0]?.name).toBe('数据中台项目');
  });

  it('rejects a negative amount, an unknown stage and a missing owner', async () => {
    const star = (await database.service.listCustomers()).find(
      (customer) => customer.name === '星辰科技',
    );
    if (!star) throw new Error('The sample customer is missing.');

    await expect(
      database.service.createOpportunity({
        name: '负数',
        customerId: star.id,
        amount: -1,
      }),
    ).rejects.toBeInstanceOf(CrmValidationError);

    await expect(
      database.service.createOpportunity({
        name: '错误阶段',
        customerId: star.id,
        amount: 100,
        stage: 'pending' as never,
      }),
    ).rejects.toMatchObject({ field: 'stage' });

    await expect(
      database.service.createContact({
        name: '无主联系人',
        customerId: 999999,
      }),
    ).rejects.toMatchObject({ field: 'customerId' });

    await expect(
      database.service.createCustomer({ name: '   ' }),
    ).rejects.toMatchObject({ field: 'name' });
  });

  it('reports a missing customer as not found', async () => {
    await expect(database.service.getCustomer(999999)).rejects.toBeInstanceOf(
      CrmNotFoundError,
    );
  });

  it('keeps an edited customer independent of its contacts and opportunities', async () => {
    const eastChina = (await database.service.listCustomers()).find(
      (customer) => customer.name === '华东制造',
    );
    if (!eastChina) throw new Error('The sample customer is missing.');

    await database.service.updateCustomer(eastChina.id, {
      name: '华东制造集团',
      industry: '高端制造',
    });
    const detail = await database.service.getCustomer(eastChina.id);

    expect(detail).toMatchObject({
      name: '华东制造集团',
      industry: '高端制造',
      amountTotal: 1800000,
    });
    expect(detail.contacts).toHaveLength(2);
  });
});
