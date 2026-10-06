// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import { createAppPaths } from '@nocobase/app-server/config';
import {
  createAppDatabaseManager,
  resolveDatabaseConfig,
  type AppDatabaseConfig,
} from '@nocobase/app-server/database';
import type { DatabaseManager } from '@nocobase/db';

import { CrmError } from '../../server/providers/crm/errors.js';
import { CrmService } from '../../server/providers/crm/service.js';

const appRoot = path.resolve(import.meta.dirname, '../..');
const migrationsDirectory = path.join(appRoot, 'database/main/migrations');
const seedsDirectory = path.join(appRoot, 'database/main/seeds');

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

interface CrmFixture {
  readonly directory: string;
  readonly manager: DatabaseManager;
  readonly service: CrmService;
  readonly client: Knex;
}

/**
 * A throwaway managed SQLite connection, the application's real migrations,
 * and — when asked — its real seed. The service is exercised directly, so these
 * tests cover business rules and SQL rather than HTTP.
 */
async function createCrmDatabase(
  options: { readonly seed?: boolean } = {},
): Promise<CrmFixture> {
  const directory = mkdtempSync(path.join(tmpdir(), 'nb3-crm-db-'));
  const config: AppDatabaseConfig = {
    default: 'main',
    drivers: {},
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'database.sqlite'),
        schemaManagement: 'managed',
      },
    },
  };
  const resolved = await resolveDatabaseConfig(config);
  const manager = createAppDatabaseManager(
    resolved,
    createAppPaths({ rootDir: appRoot, storageDir: directory }),
  );
  if (!manager) {
    throw new Error('The CRM test requires a managed default connection.');
  }

  await manager.createMigrator({ directory: migrationsDirectory }).latest();
  if (options.seed) {
    await manager.createSeeder({ directory: seedsDirectory }).run();
  }

  const client = await manager.connection('main').client<Knex>();
  cleanups.push(async () => {
    await manager.destroy();
    rmSync(directory, { recursive: true, force: true });
  });

  return { directory, manager, service: new CrmService(manager), client };
}

async function expectCrmError(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CrmError);
  expect((caught as CrmError).code).toBe(code);
}

describe('create_crm_tables migration', () => {
  it('creates and then drops the three CRM tables', async () => {
    const fixture = await createCrmDatabase();

    for (const table of ['customers', 'contacts', 'opportunities']) {
      await expect(fixture.client.schema.hasTable(table)).resolves.toBe(true);
    }

    await fixture.manager
      .createMigrator({ directory: migrationsDirectory })
      .rollback();

    for (const table of ['customers', 'contacts', 'opportunities']) {
      await expect(fixture.client.schema.hasTable(table)).resolves.toBe(false);
    }
  });
});

describe('CRM sample seed', () => {
  it('creates two customers, three contacts and three opportunities', async () => {
    const fixture = await createCrmDatabase({ seed: true });

    const customers = await fixture.service.listCustomers({});
    const contacts = await fixture.service.listContacts({});
    const opportunities = await fixture.service.listOpportunities({});

    expect(customers.map((customer) => customer.name).sort()).toEqual([
      '蓝海科技',
      '远山制造',
    ]);
    expect(contacts).toHaveLength(3);
    expect(opportunities).toHaveLength(3);
  });

  it('is idempotent when the seed runs a second time', async () => {
    const fixture = await createCrmDatabase({ seed: true });

    const result = await fixture.manager
      .createSeeder({ directory: seedsDirectory })
      .run();

    expect(result.executed).toHaveLength(0);
    await expect(fixture.service.listCustomers({})).resolves.toHaveLength(2);
    await expect(fixture.service.listContacts({})).resolves.toHaveLength(3);
    await expect(fixture.service.listOpportunities({})).resolves.toHaveLength(
      3,
    );
  });
});

describe('CrmService customers', () => {
  it('requires a name and keeps customer names unique', async () => {
    const { service } = await createCrmDatabase();
    await expectCrmError(
      () => service.createCustomer({ name: '   ' }),
      'NAME_REQUIRED',
    );

    const created = await service.createCustomer({
      name: 'Acme',
      industry: 'Manufacturing',
    });
    expect(created).toMatchObject({ name: 'Acme', industry: 'Manufacturing' });

    await expectCrmError(
      () => service.createCustomer({ name: 'Acme' }),
      'NAME_TAKEN',
    );
  });

  it('updates an existing customer and rejects an unknown one', async () => {
    const { service } = await createCrmDatabase();
    const created = await service.createCustomer({ name: 'Acme' });
    const other = await service.createCustomer({ name: 'Globex' });

    const updated = await service.updateCustomer(created.id, {
      name: 'Acme Corp',
      industry: 'Retail',
    });
    expect(updated).toMatchObject({ name: 'Acme Corp', industry: 'Retail' });

    await expectCrmError(
      () => service.updateCustomer(other.id, { name: 'Acme Corp' }),
      'NAME_TAKEN',
    );
    await expectCrmError(() => service.getCustomer(9999), 'NOT_FOUND');
  });

  it('searches customers by name and industry', async () => {
    const { service } = await createCrmDatabase();
    await service.createCustomer({ name: 'Acme', industry: 'Manufacturing' });
    await service.createCustomer({ name: 'Globex', industry: 'Retail' });

    await expect(
      service.listCustomers({ search: 'acm' }),
    ).resolves.toHaveLength(1);
    await expect(
      service.listCustomers({ search: 'retail' }),
    ).resolves.toHaveLength(1);
    await expect(
      service.listCustomers({ search: 'nobody' }),
    ).resolves.toHaveLength(0);
  });
});

describe('CrmService contacts', () => {
  it('requires a name and an existing customer', async () => {
    const { service } = await createCrmDatabase();
    const customer = await service.createCustomer({ name: 'Acme' });

    await expectCrmError(
      () => service.createContact({ name: '', customerId: customer.id }),
      'NAME_REQUIRED',
    );
    await expectCrmError(
      () => service.createContact({ name: 'Ada', customerId: 9999 }),
      'CUSTOMER_NOT_FOUND',
    );

    const contact = await service.createContact({
      name: 'Ada',
      customerId: customer.id,
      email: 'ada@acme.test',
    });
    expect(contact).toMatchObject({
      name: 'Ada',
      customerId: customer.id,
      customerName: 'Acme',
    });
  });

  it('filters contacts by customer', async () => {
    const { service } = await createCrmDatabase();
    const acme = await service.createCustomer({ name: 'Acme' });
    const globex = await service.createCustomer({ name: 'Globex' });
    await service.createContact({ name: 'Ada', customerId: acme.id });
    await service.createContact({ name: 'Grace', customerId: globex.id });

    const contacts = await service.listContacts({ customerId: acme.id });
    expect(contacts.map((contact) => contact.name)).toEqual(['Ada']);
  });
});

describe('CrmService opportunities', () => {
  it('rejects a negative amount and an invalid stage', async () => {
    const { service } = await createCrmDatabase();
    const customer = await service.createCustomer({ name: 'Acme' });

    await expectCrmError(
      () =>
        service.createOpportunity({
          name: 'Deal',
          customerId: customer.id,
          amount: -1,
          stage: 'following',
        }),
      'AMOUNT_INVALID',
    );
    await expectCrmError(
      () =>
        service.createOpportunity({
          name: 'Deal',
          customerId: customer.id,
          amount: 10,
          stage: 'unknown',
        }),
      'STAGE_INVALID',
    );
    await expectCrmError(
      () =>
        service.createOpportunity({
          name: 'Deal',
          customerId: 9999,
          amount: 10,
          stage: 'following',
        }),
      'CUSTOMER_NOT_FOUND',
    );

    const opportunity = await service.createOpportunity({
      name: 'Deal',
      customerId: customer.id,
      amount: '10.005',
      stage: 'following',
    });
    expect(opportunity.amount).toBe(10.01);
  });

  it('filters opportunities by stage', async () => {
    const { service } = await createCrmDatabase();
    const customer = await service.createCustomer({ name: 'Acme' });
    await service.createOpportunity({
      name: 'Won deal',
      customerId: customer.id,
      amount: 10,
      stage: 'won',
    });
    await service.createOpportunity({
      name: 'Lost deal',
      customerId: customer.id,
      amount: 20,
      stage: 'lost',
    });

    const won = await service.listOpportunities({ stage: 'won' });
    expect(won.map((opportunity) => opportunity.name)).toEqual(['Won deal']);
  });

  it('totals only the customer’s own opportunities and follows amount updates', async () => {
    const { service } = await createCrmDatabase();
    const acme = await service.createCustomer({ name: 'Acme' });
    const globex = await service.createCustomer({ name: 'Globex' });

    await service.createOpportunity({
      name: 'Acme one',
      customerId: acme.id,
      amount: 100000,
      stage: 'following',
    });
    const second = await service.createOpportunity({
      name: 'Acme two',
      customerId: acme.id,
      amount: 80000,
      stage: 'won',
    });
    await service.createOpportunity({
      name: 'Globex one',
      customerId: globex.id,
      amount: 260000,
      stage: 'lost',
    });

    const detail = await service.getCustomerDetail(acme.id);
    expect(detail.opportunityAmountTotal).toBe(180000);
    expect(
      detail.opportunities.map((opportunity) => opportunity.name).sort(),
    ).toEqual(['Acme one', 'Acme two']);
    // The other customer's opportunity is never counted.
    expect(
      detail.opportunities.some(
        (opportunity) => opportunity.name === 'Globex one',
      ),
    ).toBe(false);

    await service.updateOpportunity(second.id, { amount: 150000 });
    const updated = await service.getCustomerDetail(acme.id);
    expect(updated.opportunityAmountTotal).toBe(250000);
    await expect(service.getCustomerDetail(globex.id)).resolves.toMatchObject({
      opportunityAmountTotal: 260000,
    });
  });
});
