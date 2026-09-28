// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  defineDatabase,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type MigrationContext,
  type SeedContext,
} from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';

import migration from '../../database/main/migrations/202610010001_create_crm_collections.js';
import seed from '../../database/main/seeds/202610010002_crm_demo_records.js';
import {
  CrmNotFoundError,
  CrmValidationError,
  createCrmService,
  type CrmService,
} from '../../server/providers/crm.js';

const tempDirs: string[] = [];
let database: DatabaseManager | undefined;

async function createTestDatabase(): Promise<DatabaseManager> {
  const directory = mkdtempSync(path.join(tmpdir(), 'nocobase-crm-test-'));
  tempDirs.push(directory);
  const manager = createDatabaseManager(
    defineDatabase({
      default: 'main',
      connections: {
        main: sqlite({
          filename: path.join(directory, 'database.sqlite'),
          schemaManagement: 'managed',
        }),
      },
      metadataStore: new InMemoryCollectionMetadataStore(),
    }),
  );
  await manager.connect('main');
  return manager;
}

async function applyMigration(manager: DatabaseManager): Promise<void> {
  if (!migration.up) {
    throw new Error('The CRM migration has no up().');
  }
  await migration.up({
    builder: manager.builder(),
    query: manager.query(),
  } as unknown as MigrationContext);
}

async function runSeed(manager: DatabaseManager): Promise<void> {
  await seed.run({
    repository: (name: string) => manager.repository(name),
    query: manager.query(),
  } as unknown as SeedContext);
}

async function createSeededService(): Promise<{
  readonly manager: DatabaseManager;
  readonly crm: CrmService;
}> {
  const manager = await createTestDatabase();
  await applyMigration(manager);
  await runSeed(manager);
  return { manager, crm: createCrmService(manager) };
}

beforeEach(() => {
  database = undefined;
});

afterEach(async () => {
  await database?.destroy();
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('CRM migration and seed', () => {
  it('creates the three collections and is reversible', async () => {
    database = await createTestDatabase();
    await applyMigration(database);

    const collections = database.collections('main');
    expect(await collections.get('customers')).toBeDefined();
    expect(await collections.get('contacts')).toBeDefined();
    expect(await collections.get('opportunities')).toBeDefined();

    if (!migration.down) {
      throw new Error('The CRM migration has no down().');
    }
    await migration.down({
      builder: database.builder(),
      query: database.query(),
    } as unknown as MigrationContext);

    const afterDrop = database.collections('main');
    expect(await afterDrop.get('customers')).toBeUndefined();
  });

  it('seeds the baseline records idempotently', async () => {
    database = await createTestDatabase();
    await applyMigration(database);
    await runSeed(database);
    await runSeed(database);

    const crm = createCrmService(database);
    const customers = await crm.listCustomers();
    expect(customers.map((customer) => customer.name).sort()).toEqual([
      '星辰科技',
      '蓝海贸易',
    ]);

    const contacts = await crm.listContacts();
    expect(contacts).toHaveLength(3);
    expect(contacts.filter((contact) => contact.customerId === 1)).toHaveLength(
      2,
    );

    const opportunities = await crm.listOpportunities();
    expect(opportunities).toHaveLength(3);
  });
});

describe('CRM service', () => {
  it('reports each customer only its own contacts, opportunities and total', async () => {
    const { manager, crm } = await createSeededService();
    database = manager;

    const summaries = await crm.listCustomers();
    const star = summaries.find((customer) => customer.name === '星辰科技');
    const blue = summaries.find((customer) => customer.name === '蓝海贸易');

    expect(star).toMatchObject({
      contactCount: 2,
      opportunityCount: 2,
      opportunityTotal: 200000,
    });
    expect(blue).toMatchObject({
      contactCount: 1,
      opportunityCount: 1,
      opportunityTotal: 50000,
    });

    const detail = await crm.getCustomer(star!.id);
    expect(detail?.contacts).toHaveLength(2);
    expect(detail?.opportunities).toHaveLength(2);
    expect(detail?.opportunityTotal).toBe(200000);
    expect(
      detail?.opportunities.every(
        (opportunity) => opportunity.customerId === star!.id,
      ),
    ).toBe(true);
  });

  it('filters opportunities by stage', async () => {
    const { manager, crm } = await createSeededService();
    database = manager;

    const won = await crm.listOpportunities({ stage: 'won' });
    expect(won).toHaveLength(1);
    expect(won[0]?.name).toBe('企业版续约');

    const following = await crm.listOpportunities({ stage: 'following' });
    expect(following).toHaveLength(1);
    expect(following[0]?.name).toBe('数据平台升级');
  });

  it('updates the customer total when an opportunity amount changes', async () => {
    const { manager, crm } = await createSeededService();
    database = manager;

    const opportunities = await crm.listOpportunities();
    const following = opportunities.find(
      (opportunity) => opportunity.name === '数据平台升级',
    );

    const updated = await crm.updateOpportunity(following!.id, {
      amount: 150000,
    });
    expect(updated?.amount).toBe(150000);

    const star = (await crm.listCustomers()).find(
      (customer) => customer.name === '星辰科技',
    );
    expect(star?.opportunityTotal).toBe(270000);

    const blue = (await crm.listCustomers()).find(
      (customer) => customer.name === '蓝海贸易',
    );
    expect(blue?.opportunityTotal).toBe(50000);
  });

  it('creates and edits records and keeps customer names on contacts', async () => {
    const { manager, crm } = await createSeededService();
    database = manager;

    const customer = await crm.createCustomer({
      name: '  云端动力  ',
      industry: '云计算',
    });
    expect(customer.name).toBe('云端动力');

    const contact = await crm.createContact({
      name: '赵敏',
      phone: '13900000009',
      customerId: customer.id,
    });
    expect(contact.customerName).toBe('云端动力');
    expect(contact.customerId).toBe(customer.id);

    const opportunity = await crm.createOpportunity({
      name: '云服务采购',
      customerId: customer.id,
      amount: '25000.5',
      stage: 'following',
    });
    expect(opportunity.amount).toBe(25000.5);

    const detail = await crm.getCustomer(customer.id);
    expect(detail?.contactCount).toBe(1);
    expect(detail?.opportunityTotal).toBe(25000.5);

    const renamed = await crm.updateCustomer(customer.id, {
      name: '云端动力科技',
      industry: '',
    });
    expect(renamed?.name).toBe('云端动力科技');
    expect(renamed?.industry).toBeNull();
  });

  it('rejects invalid input with typed validation errors', async () => {
    const { manager, crm } = await createSeededService();
    database = manager;

    await expect(crm.createCustomer({ name: '   ' })).rejects.toThrow(
      CrmValidationError,
    );
    await expect(
      crm.createOpportunity({ name: '缺少客户', amount: 10 }),
    ).rejects.toThrow(CrmValidationError);
    await expect(
      crm.createOpportunity({
        name: '负金额',
        customerId: 1,
        amount: -1,
      }),
    ).rejects.toThrow(CrmValidationError);
    await expect(
      crm.createOpportunity({
        name: '非法阶段',
        customerId: 1,
        stage: 'pending',
      }),
    ).rejects.toThrow(CrmValidationError);
    await expect(
      crm.createContact({ name: '无客户', customerId: 99999 }),
    ).rejects.toThrow(CrmNotFoundError);
  });
});
