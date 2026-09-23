// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { Context, Next } from 'hono';
import type { Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  defineDatabase,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';

import { crmApiRoutes } from '../../server/routes/crm.js';
import {
  createCrmService,
  crmServiceToken,
  type CrmService,
} from '../../server/providers/crm.js';
import crmSeed from '../../database/main/seeds/202609230002_seed_crm_data.js';

const migrationsDirectory = path.resolve('database/main/migrations');
const seedsDirectory = path.resolve('database/main/seeds');
const PACKAGE_NAME = 'app-crm-test';

interface Fixture {
  readonly database: DatabaseManager;
  dispose(): Promise<void>;
}

const fixtures: Fixture[] = [];

afterAll(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.dispose()));
});

function createFixture(): Fixture {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'crm-'));
  const database = createDatabaseManager(
    defineDatabase({
      default: 'main',
      drivers: { sqlite },
      connections: {
        main: { dialect: 'sqlite', filename: path.join(root, 'crm.sqlite') },
      },
    }),
  );
  const fixture: Fixture = {
    database,
    async dispose() {
      await database.destroy();
      rmSync(root, { recursive: true, force: true });
    },
  };
  fixtures.push(fixture);
  return fixture;
}

async function migrate(database: DatabaseManager): Promise<void> {
  const migrator = database.createMigrator({
    directory: migrationsDirectory,
    packageName: PACKAGE_NAME,
  });
  await database.connect('main');
  const result = await migrator.latest();
  expect(result.executed).toContain('202609230001_create_crm_tables');
}

async function seed(database: DatabaseManager): Promise<void> {
  const seeder = database.createSeeder({
    directory: seedsDirectory,
    packageName: PACKAGE_NAME,
  });
  await seeder.run();
}

describe('CRM migration', () => {
  it('creates the three tables, their foreign keys and indexes, and reverses them', async () => {
    const { database } = createFixture();
    await migrate(database);
    const client = await database.connection('main').client<Knex>();

    expect(await client.schema.hasTable('customers')).toBe(true);
    expect(await client.schema.hasTable('contacts')).toBe(true);
    expect(await client.schema.hasTable('opportunities')).toBe(true);

    const customerColumns = await client('customers')
      .columnInfo()
      .then((info: Record<string, { nullable: boolean }>) => info);
    expect(customerColumns.name.nullable).toBe(false);
    expect(customerColumns.industry.nullable).toBe(true);

    const contactForeignKey = await client
      .raw('PRAGMA foreign_key_list(contacts)')
      .then(
        (rows: Array<{ table: string; from: string; on_delete: string }>) =>
          rows[0],
      );
    expect(contactForeignKey).toMatchObject({
      table: 'customers',
      from: 'customer_id',
      on_delete: 'CASCADE',
    });

    const indexes = await client('sqlite_master')
      .where({ type: 'index' })
      .pluck('name');
    expect(indexes).toContain('idx_opportunities_stage');
    expect(indexes).toContain('idx_contacts_customer_id');

    const migrator = database.createMigrator({
      directory: migrationsDirectory,
      packageName: PACKAGE_NAME,
    });
    const rollback = await migrator.rollback();
    expect(rollback.rolledBack).toContain('202609230001_create_crm_tables');
    expect(await client.schema.hasTable('customers')).toBe(false);
    expect(await client.schema.hasTable('contacts')).toBe(false);
    expect(await client.schema.hasTable('opportunities')).toBe(false);
  });
});

describe('CRM seed', () => {
  it('writes the fixed data set once and is idempotent on a repeat run', async () => {
    const { database } = createFixture();
    await migrate(database);
    await seed(database);
    await seed(database);

    // Run the definition again outside the seed history, so the "insert only when absent" guard is what keeps
    // this from duplicating. A seeder re-run alone would prove only that history skipped it.
    const context = {
      query: database.query(),
      connection: database.connection('main'),
    };
    await crmSeed.run(context);
    await crmSeed.run(context);

    const service = createCrmService(database);
    const customers = await service.listCustomers();
    expect(customers).toHaveLength(2);
    expect(customers.map((customer) => customer.name)).toEqual([
      '星河科技',
      '蓝海贸易',
    ]);

    const contacts = await service.listContacts();
    expect(contacts).toHaveLength(3);
    const opportunities = await service.listOpportunities();
    expect(opportunities).toHaveLength(3);
    expect(
      opportunities.map((opportunity) => opportunity.stage).sort(),
    ).toEqual(['following', 'lost', 'won']);
  });
});

describe('CRM service', () => {
  let service: CrmService;

  beforeAll(async () => {
    const { database } = createFixture();
    await migrate(database);
    await seed(database);
    service = createCrmService(database);
  });

  it('computes a customer total from stored opportunities', async () => {
    const customers = await service.listCustomers();
    const xinghe = customers.find((customer) => customer.name === '星河科技');
    expect(xinghe).toBeDefined();

    const detail = await service.getCustomer(xinghe!.id);
    expect(detail).not.toBeNull();
    expect(detail!.contacts.map((contact) => contact.name)).toEqual([
      '张伟',
      '李娜',
    ]);
    expect(detail!.opportunities).toHaveLength(2);
    // 120000 won + 80000 following, read back from the records rather than typed in the UI.
    expect(detail!.opportunityAmountTotal).toBe(200000);
  });

  it('filters opportunities by stage', async () => {
    const won = await service.listOpportunities('won');
    expect(won).toHaveLength(1);
    expect(won[0].name).toBe('星河科技-年度续费');

    const lost = await service.listOpportunities('lost');
    expect(lost).toHaveLength(1);
    expect(lost[0].customerName).toBe('蓝海贸易');
  });

  it('rejects a negative amount and a missing customer', async () => {
    await expect(
      service.createOpportunity({
        name: '无效商机',
        customerId: 1,
        amount: -1,
        stage: 'following',
      }),
    ).rejects.toThrow(/non-negative/);

    await expect(
      service.createContact({ name: '无主联系人', customerId: 9999 }),
    ).rejects.toThrow(/does not exist/);
  });

  it('creates and edits records through the same rules the routes use', async () => {
    const customer = await service.createCustomer({
      name: '新客户',
      industry: '制造业',
    });
    expect(customer.industry).toBe('制造业');

    const updated = await service.updateCustomer(customer.id, {
      industry: null,
    });
    expect(updated.name).toBe('新客户');
    expect(updated.industry).toBeNull();

    const contact = await service.createContact({
      name: '新联系人',
      contactInfo: '010-1234',
      customerId: customer.id,
    });
    expect(contact.customerName).toBe('新客户');

    const opportunity = await service.createOpportunity({
      name: '新商机',
      customerId: customer.id,
      amount: 0,
      stage: 'following',
    });
    expect(opportunity.amount).toBe(0);

    const detail = await service.getCustomer(customer.id);
    expect(detail!.opportunityAmountTotal).toBe(0);

    const won = await service.updateOpportunity(opportunity.id, {
      stage: 'won',
      amount: 5000,
    });
    expect(won.stage).toBe('won');
    expect(
      (await service.getCustomer(customer.id))!.opportunityAmountTotal,
    ).toBe(5000);
  });
});

describe('CRM routes', () => {
  let app: Application;
  let service: CrmService;
  let database: DatabaseManager;

  beforeAll(async () => {
    const fixture = createFixture();
    database = fixture.database;
    await migrate(database);
    await seed(database);
    service = createCrmService(database);

    const fakeAuth = {
      required:
        () =>
        async (context: Context, next: Next): Promise<Response | void> => {
          if (context.req.header('x-test-auth') !== 'yes') {
            return context.json({ code: 'UNAUTHENTICATED' }, 401);
          }
          await next();
        },
    };

    app = {
      container: {
        resolve: (token: unknown) => {
          if (token === authenticationToken) return fakeAuth;
          if (token === crmServiceToken) return service;
          throw new Error('Unexpected token in CRM route test.');
        },
      },
    } as unknown as Application;
  });

  it('rejects anonymous requests', async () => {
    const router = await crmApiRoutes.createRouter(app);
    const response = await router.request('/crm/customers');
    expect(response.status).toBe(401);
  });

  it('returns the customer list and detail to a signed-in caller', async () => {
    const router = await crmApiRoutes.createRouter(app);
    const list = await router.request('/crm/customers', {
      headers: { 'x-test-auth': 'yes' },
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { data: Array<{ id: number }> };
    expect(body.data).toHaveLength(2);

    const detail = await router.request(`/crm/customers/${body.data[0].id}`, {
      headers: { 'x-test-auth': 'yes' },
    });
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      data: { contacts: unknown[]; opportunityAmountTotal: number };
    };
    expect(detailBody.data.contacts.length).toBeGreaterThan(0);
    expect(typeof detailBody.data.opportunityAmountTotal).toBe('number');
  });

  it('maps validation and not-found errors to 400 and 404', async () => {
    const router = await crmApiRoutes.createRouter(app);
    const headers = {
      'x-test-auth': 'yes',
      'content-type': 'application/json',
    };

    const negative = await router.request('/crm/opportunities', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: '负数',
        customerId: 1,
        amount: -5,
        stage: 'following',
      }),
    });
    expect(negative.status).toBe(400);

    const badStage = await router.request('/crm/opportunities?stage=unknown', {
      headers: { 'x-test-auth': 'yes' },
    });
    expect(badStage.status).toBe(400);

    const missing = await router.request('/crm/customers/9999', {
      headers: { 'x-test-auth': 'yes' },
    });
    expect(missing.status).toBe(404);
  });

  it('filters the opportunity list by stage', async () => {
    const router = await crmApiRoutes.createRouter(app);
    const response = await router.request('/crm/opportunities?stage=won', {
      headers: { 'x-test-auth': 'yes' },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ name: string; stage: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].stage).toBe('won');
  });
});
