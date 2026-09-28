// @vitest-environment node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCrmService, CrmError } from '../../server/providers/crm.js';

const applicationRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const migrationsDirectory = path.join(
  applicationRoot,
  'database',
  'main',
  'migrations',
);
const seedsDirectory = path.join(applicationRoot, 'database', 'main', 'seeds');
const packageName = 'nb3-factory';

/**
 * The CRM feature against a real SQLite database: the migration builds the
 * schema, the seed fills it, and the service is exercised over the rows it
 * reads back. The mock database the application-server test uses cannot show
 * whether a decimal aggregate excludes another customer's opportunities, so
 * this suite runs against the same dialect the application ships with.
 */
describe('CRM data and rules', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      default: 'main',
      connections: { main: sqlite({ filename: ':memory:' }) },
    });
    await database
      .createMigrator({
        sources: [{ packageName, directory: migrationsDirectory }],
      })
      .latest();
  });

  afterEach(async () => {
    await database.destroy();
  });

  function service() {
    return createCrmService(database);
  }

  async function runSeed(): Promise<void> {
    await database
      .createSeeder({ sources: [{ packageName, directory: seedsDirectory }] })
      .run();
  }

  async function customerNamed(name: string) {
    const customers = await service().listCustomers();
    const customer = customers.find((row) => row.name === name);
    if (!customer) {
      throw new Error(`Seed did not create customer "${name}".`);
    }
    return customer;
  }

  it('creates the three tables and seeds the sample data', async () => {
    await runSeed();
    const crm = service();

    const customers = await crm.listCustomers();
    expect(customers.map((row) => row.name).sort()).toEqual(
      ['星辰科技', '蓝海制造'].sort(),
    );

    const contacts = await crm.listContacts();
    expect(contacts).toHaveLength(3);

    const opportunities = await crm.listOpportunities();
    expect(opportunities).toHaveLength(3);
    expect(opportunities.map((row) => row.stage).sort()).toEqual(
      ['following', 'won', 'lost'].sort(),
    );
  });

  it('does not duplicate or reset rows when the seed runs twice', async () => {
    await runSeed();
    const first = await customerNamed('星辰科技');
    await service().updateCustomer(first.id, { industry: '软件服务定制' });

    await runSeed();

    const crm = service();
    expect(await crm.listCustomers()).toHaveLength(2);
    expect(await crm.listContacts()).toHaveLength(3);
    expect(await crm.listOpportunities()).toHaveLength(3);
    // The team's own edit survives a second seed run.
    expect((await customerNamed('星辰科技')).industry).toBe('软件服务定制');
  });

  it('sums only the customer’s own opportunities in its detail', async () => {
    await runSeed();
    const crm = service();
    const xingchen = await customerNamed('星辰科技');
    const lanhai = await customerNamed('蓝海制造');

    const detail = await crm.getCustomer(xingchen.id);
    expect(detail.totalAmount).toBe(200000);
    expect(detail.contacts).toHaveLength(2);
    expect(detail.opportunities).toHaveLength(2);
    expect(
      detail.opportunities.every(
        (opportunity) => opportunity.customerId === xingchen.id,
      ),
    ).toBe(true);
    // 蓝海制造's 50000 opportunity is not part of 星辰科技's total.
    expect(detail.opportunities.map((row) => row.amount)).not.toContain(50000);

    const lanhaiDetail = await crm.getCustomer(lanhai.id);
    expect(lanhaiDetail.totalAmount).toBe(50000);
  });

  it('updates the customer total when an opportunity amount changes', async () => {
    await runSeed();
    const crm = service();
    const xingchen = await customerNamed('星辰科技');

    const created = await crm.createOpportunity({
      name: '追加数据模块',
      customerId: xingchen.id,
      amount: 15000.5,
      stage: 'following',
    });
    expect((await crm.getCustomer(xingchen.id)).totalAmount).toBe(215000.5);

    await crm.updateOpportunity(created.id, { amount: 20000 });
    expect((await crm.getCustomer(xingchen.id)).totalAmount).toBe(220000);

    // A new opportunity for the other customer must not leak into this total.
    const lanhai = await customerNamed('蓝海制造');
    await crm.createOpportunity({
      name: '生产线改造二期',
      customerId: lanhai.id,
      amount: 700000,
      stage: 'following',
    });
    expect((await crm.getCustomer(xingchen.id)).totalAmount).toBe(220000);
    expect((await crm.getCustomer(lanhai.id)).totalAmount).toBe(750000);
  });

  it('filters the opportunity list by stage', async () => {
    await runSeed();
    const crm = service();

    const following = await crm.listOpportunities('following');
    expect(following).toHaveLength(1);
    expect(following[0]?.stage).toBe('following');

    const won = await crm.listOpportunities('won');
    expect(won).toHaveLength(1);
    expect(won[0]?.name).toBe('数据平台实施服务');
  });

  it('rejects a negative amount', async () => {
    await runSeed();
    const crm = service();
    const xingchen = await customerNamed('星辰科技');

    await expect(
      crm.createOpportunity({
        name: '负数商机',
        customerId: xingchen.id,
        amount: -1,
        stage: 'following',
      }),
    ).rejects.toMatchObject({ name: 'CrmError', code: 'VALIDATION_ERROR' });
  });

  it('rejects a customer without a name', async () => {
    const crm = service();
    await expect(crm.createCustomer({ name: '   ' })).rejects.toBeInstanceOf(
      CrmError,
    );
    await expect(crm.createCustomer({ name: '   ' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects an unsupported stage', async () => {
    await runSeed();
    const crm = service();
    const xingchen = await customerNamed('星辰科技');

    await expect(
      crm.createOpportunity({
        name: '无效阶段',
        customerId: xingchen.id,
        amount: 100,
        stage: 'negotiating',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('reports an unknown customer as not found', async () => {
    await runSeed();
    await expect(service().getCustomer(987654)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rolls the migration back to an empty schema', async () => {
    const migrator = database.createMigrator({
      sources: [{ packageName, directory: migrationsDirectory }],
    });
    await migrator.rollback();

    await expect(migrator.history()).resolves.toEqual([]);
    // The tables are gone, so any read through the service now fails.
    await expect(service().listCustomers()).rejects.toBeTruthy();
  });
});
