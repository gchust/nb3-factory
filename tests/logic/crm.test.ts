// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationContext,
  type SeedContext,
} from '@nocobase/db';
import { sqliteDriver } from '@nocobase/db-sqlite';

import migration from '../../database/main/migrations/20260210120000_create_crm.js';
import seed from '../../database/main/seeds/20260210120100_crm_sample_data.js';
import {
  CrmNotFoundError,
  CrmService,
  CrmValidationError,
  crmServiceToken,
} from '../../server/providers/crm.js';
import { crmApiRoutes } from '../../server/routes/crm.js';

const TABLES = ['crm_customers', 'crm_contacts', 'crm_opportunities'];

async function createTestDatabase(): Promise<{
  database: DatabaseManager;
  dir: string;
}> {
  const dir = mkdtempSync(path.join(tmpdir(), 'crm-test-'));
  const database = createDatabaseManager({
    default: 'main',
    drivers: { sqlite: sqliteDriver },
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(dir, 'database.sqlite'),
        schemaManagement: 'managed',
      },
    },
  } as never);
  await database.connect();
  await migration.up({
    builder: database.builder(),
  } as unknown as MigrationContext);
  return { database, dir };
}

async function runSeed(database: DatabaseManager): Promise<void> {
  await seed.run({
    repository: (collection: string) => database.repository(collection),
  } as unknown as SeedContext);
}

async function tableExists(
  database: DatabaseManager,
  tableName: string,
): Promise<boolean> {
  const physical = await database
    .connection()
    .schemaInspector.getPhysicalCollection({ tableName });
  return physical !== undefined;
}

describe('CRM migration', () => {
  let database: DatabaseManager;
  let dir: string;

  beforeEach(async () => {
    ({ database, dir } = await createTestDatabase());
  });

  afterEach(async () => {
    await database.destroy();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the three tables with their columns and foreign keys', async () => {
    for (const table of TABLES) {
      expect(await tableExists(database, table)).toBe(true);
    }

    const customers = await database
      .connection()
      .schemaInspector.getPhysicalCollection({ tableName: 'crm_customers' });
    expect(customers?.columns.map((column) => column.columnName)).toEqual(
      expect.arrayContaining(['id', 'name', 'industry']),
    );

    const contacts = await database
      .connection()
      .schemaInspector.getPhysicalCollection({ tableName: 'crm_contacts' });
    expect(contacts?.columns.map((column) => column.columnName)).toEqual(
      expect.arrayContaining(['id', 'name', 'contact_info', 'customer_id']),
    );
    expect(
      contacts?.foreignKeys.some(
        (foreignKey) =>
          foreignKey.columns.includes('customer_id') &&
          foreignKey.referencedCollection.tableName === 'crm_customers' &&
          foreignKey.onDelete === 'cascade',
      ),
    ).toBe(true);

    const opportunities = await database
      .connection()
      .schemaInspector.getPhysicalCollection({
        tableName: 'crm_opportunities',
      });
    expect(opportunities?.columns.map((column) => column.columnName)).toEqual(
      expect.arrayContaining(['id', 'name', 'customer_id', 'amount', 'stage']),
    );
    expect(
      opportunities?.foreignKeys.some(
        (foreignKey) =>
          foreignKey.referencedCollection.tableName === 'crm_customers',
      ),
    ).toBe(true);
  });

  it('reverses every change in down', async () => {
    await migration.down!({
      builder: database.builder(),
    } as unknown as MigrationContext);

    for (const table of TABLES) {
      expect(await tableExists(database, table)).toBe(false);
    }
  });
});

describe('CRM seed', () => {
  let database: DatabaseManager;
  let dir: string;

  beforeEach(async () => {
    ({ database, dir } = await createTestDatabase());
  });

  afterEach(async () => {
    await database.destroy();
    rmSync(dir, { recursive: true, force: true });
  });

  it('inserts exactly two customers, three contacts and three opportunities', async () => {
    await runSeed(database);

    await expect(database.repository('crm_customers').count({})).resolves.toBe(
      2,
    );
    await expect(database.repository('crm_contacts').count({})).resolves.toBe(
      3,
    );
    await expect(
      database.repository('crm_opportunities').count({}),
    ).resolves.toBe(3);
  });

  it('is idempotent and keeps a repeated run a no-op', async () => {
    await runSeed(database);
    await runSeed(database);

    await expect(database.repository('crm_customers').count({})).resolves.toBe(
      2,
    );
    await expect(database.repository('crm_contacts').count({})).resolves.toBe(
      3,
    );
    await expect(
      database.repository('crm_opportunities').count({}),
    ).resolves.toBe(3);
  });

  it('does not overwrite a user change on a repeated run', async () => {
    await runSeed(database);
    const customers = database.repository('crm_customers');
    const starSea = await customers.findOne({ filter: { name: '星海科技' } });
    expect(starSea).toBeDefined();
    await customers.updateOne({
      filter: { id: starSea!.id },
      values: { industry: '软件服务' },
    });

    await runSeed(database);

    const after = await customers.findOne({ filter: { id: starSea!.id } });
    expect(after?.industry).toBe('软件服务');
  });
});

describe('CRM service', () => {
  let database: DatabaseManager;
  let dir: string;
  let service: CrmService;

  beforeEach(async () => {
    ({ database, dir } = await createTestDatabase());
    await runSeed(database);
    service = new CrmService(database);
  });

  afterEach(async () => {
    await database.destroy();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists customers and filters by search text', async () => {
    const all = await service.listCustomers();
    expect(all.map((customer) => customer.name)).toEqual(
      expect.arrayContaining(['星海科技', '恒远贸易']),
    );

    const filtered = await service.listCustomers('恒远');
    expect(filtered.map((customer) => customer.name)).toEqual(['恒远贸易']);
  });

  it('computes the customer total from its actual opportunity records', async () => {
    const customers = await service.listCustomers();
    const byName = new Map(
      customers.map((customer) => [customer.name, customer.id]),
    );

    const starSea = await service.getCustomerDetail(byName.get('星海科技')!);
    expect(starSea.contacts).toHaveLength(2);
    expect(starSea.opportunities).toHaveLength(1);
    expect(starSea.totalAmount).toBe(120000);

    const hengyuan = await service.getCustomerDetail(byName.get('恒远贸易')!);
    expect(hengyuan.contacts).toHaveLength(1);
    expect(hengyuan.opportunities).toHaveLength(2);
    expect(hengyuan.totalAmount).toBe(430000);
  });

  it('returns a numeric amount even though sqlite stores decimals as strings', async () => {
    const opportunities = await service.listOpportunities();
    for (const opportunity of opportunities) {
      expect(typeof opportunity.amount).toBe('number');
    }
  });

  it('filters opportunities by stage and customer', async () => {
    const won = await service.listOpportunities({ stage: 'won' });
    expect(won.map((opportunity) => opportunity.name)).toEqual([
      '年度采购合同',
    ]);

    const following = await service.listOpportunities({ stage: 'following' });
    expect(following.map((opportunity) => opportunity.name)).toEqual([
      '企业官网改版',
    ]);

    const customers = await service.listCustomers();
    const hengyuan = customers.find(
      (customer) => customer.name === '恒远贸易',
    )!;
    const hengyuanOpportunities = await service.listOpportunities({
      customerId: hengyuan.id,
    });
    expect(hengyuanOpportunities).toHaveLength(2);
  });

  it('creates and updates records and validates input', async () => {
    const customer = await service.createCustomer({
      name: '  新客户  ',
      industry: '',
    });
    expect(customer.name).toBe('新客户');
    expect(customer.industry).toBeNull();

    const updated = await service.updateCustomer(customer.id, {
      name: '新客户（改名）',
      industry: '教育',
    });
    expect(updated.name).toBe('新客户（改名）');
    expect(updated.industry).toBe('教育');

    const contact = await service.createContact({
      name: '赵敏',
      contactInfo: 'zhaomin@example.com',
      customerId: customer.id,
    });
    expect(contact.customerName).toBe('新客户（改名）');

    const opportunity = await service.createOpportunity({
      name: '新商机',
      customerId: customer.id,
      amount: '1234.567',
      stage: 'following',
    });
    expect(opportunity.amount).toBe(1234.57);

    const detail = await service.getCustomerDetail(customer.id);
    expect(detail.totalAmount).toBe(1234.57);

    await expect(
      service.createOpportunity({
        name: '负数商机',
        customerId: customer.id,
        amount: -1,
      }),
    ).rejects.toBeInstanceOf(CrmValidationError);
    await expect(
      service.createOpportunity({
        name: '未知阶段',
        customerId: customer.id,
        stage: 'archived',
      }),
    ).rejects.toBeInstanceOf(CrmValidationError);
    await expect(
      service.createCustomer({ name: '   ' }),
    ).rejects.toBeInstanceOf(CrmValidationError);
    await expect(
      service.createContact({ name: '无客户', customerId: 99999 }),
    ).rejects.toBeInstanceOf(CrmValidationError);
  });

  it('reports a missing customer as not found', async () => {
    await expect(service.getCustomerDetail(99999)).rejects.toBeInstanceOf(
      CrmNotFoundError,
    );
  });

  it('reads a single contact and a single opportunity by id', async () => {
    const [contact] = await service.listContacts();
    const loadedContact = await service.getContact(contact.id);
    expect(loadedContact.id).toBe(contact.id);
    expect(loadedContact.customerName).not.toBeNull();

    const [opportunity] = await service.listOpportunities();
    const loadedOpportunity = await service.getOpportunity(opportunity.id);
    expect(loadedOpportunity.id).toBe(opportunity.id);
    expect(loadedOpportunity.customerName).not.toBeNull();

    await expect(service.getContact(99999)).rejects.toBeInstanceOf(
      CrmNotFoundError,
    );
    await expect(service.getOpportunity(99999)).rejects.toBeInstanceOf(
      CrmNotFoundError,
    );
  });
});

function createRouteApp(service: CrmService): Application {
  const required =
    () => async (context: Context, next: () => Promise<void>) => {
      if (!context.req.header('authorization')) {
        return context.json({ message: 'Unauthorized' }, 401);
      }
      await next();
      return undefined;
    };

  return {
    container: {
      resolve: (token: unknown) => {
        if (token === authenticationToken) {
          return { required };
        }
        if (token === crmServiceToken) {
          return service;
        }
        throw new Error('Unexpected service token');
      },
    },
  } as unknown as Application;
}

describe('CRM routes', () => {
  let database: DatabaseManager;
  let dir: string;
  let root: Hono;

  beforeEach(async () => {
    ({ database, dir } = await createTestDatabase());
    await runSeed(database);
    const router = await crmApiRoutes.createRouter(
      createRouteApp(new CrmService(database)),
    );
    root = new Hono();
    root.route('/api', router);
  });

  afterEach(async () => {
    await database.destroy();
    rmSync(dir, { recursive: true, force: true });
  });

  const authHeaders = {
    authorization: 'Bearer test-session',
    'content-type': 'application/json',
  };

  it('rejects an unauthenticated request', async () => {
    const response = await root.request('/api/crm/customers');
    expect(response.status).toBe(401);
  });

  it('lists and creates customers for an authenticated request', async () => {
    const list = await root.request('/api/crm/customers', {
      headers: authHeaders,
    });
    expect(list.status).toBe(200);
    const listed = (await list.json()) as { data: { name: string }[] };
    expect(listed.data).toHaveLength(2);

    const created = await root.request('/api/crm/customers', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: '接口客户', industry: '金融' }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { data: { id: number } };
    expect(createdBody.data.id).toBeGreaterThan(0);
  });

  it('returns a customer detail with the computed total', async () => {
    const list = await root.request('/api/crm/customers', {
      headers: authHeaders,
    });
    const listed = (await list.json()) as {
      data: { id: number; name: string }[];
    };
    const starSea = listed.data.find(
      (customer) => customer.name === '星海科技',
    )!;

    const detail = await root.request(`/api/crm/customers/${starSea.id}`, {
      headers: authHeaders,
    });
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as {
      data: { totalAmount: number; contacts: unknown[] };
    };
    expect(body.data.totalAmount).toBe(120000);
    expect(body.data.contacts).toHaveLength(2);
  });

  it('filters opportunities by stage', async () => {
    const response = await root.request('/api/crm/opportunities?stage=won', {
      headers: authHeaders,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { name: string }[] };
    expect(body.data.map((opportunity) => opportunity.name)).toEqual([
      '年度采购合同',
    ]);
  });

  it('rejects invalid business input with 400 and a code', async () => {
    const response = await root.request('/api/crm/opportunities', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: '负数商机',
        customerId: 1,
        amount: -5,
      }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; field: string };
    expect(body.code).toBe('CRM_INVALID_INPUT');
    expect(body.field).toBe('amount');
  });

  it('reports an unknown customer as 404', async () => {
    const response = await root.request('/api/crm/customers/99999', {
      headers: authHeaders,
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('CRM_NOT_FOUND');
  });

  it('loads a single contact and a single opportunity for the edit dialog', async () => {
    const contacts = await root.request('/api/crm/contacts', {
      headers: authHeaders,
    });
    const contactList = (await contacts.json()) as {
      data: { id: number; name: string }[];
    };
    const [contact] = contactList.data;

    const contactResponse = await root.request(
      `/api/crm/contacts/${contact.id}`,
      { headers: authHeaders },
    );
    expect(contactResponse.status).toBe(200);
    const contactBody = (await contactResponse.json()) as {
      data: { id: number; customerName: string | null };
    };
    expect(contactBody.data.id).toBe(contact.id);
    expect(contactBody.data.customerName).not.toBeNull();

    const opportunities = await root.request('/api/crm/opportunities', {
      headers: authHeaders,
    });
    const opportunityList = (await opportunities.json()) as {
      data: { id: number }[];
    };
    const [opportunity] = opportunityList.data;

    const opportunityResponse = await root.request(
      `/api/crm/opportunities/${opportunity.id}`,
      { headers: authHeaders },
    );
    expect(opportunityResponse.status).toBe(200);
    const opportunityBody = (await opportunityResponse.json()) as {
      data: { id: number };
    };
    expect(opportunityBody.data.id).toBe(opportunity.id);
  });

  it('rejects an unauthenticated request for a single record', async () => {
    const contact = await root.request('/api/crm/contacts/1');
    expect(contact.status).toBe(401);
    const opportunity = await root.request('/api/crm/opportunities/1');
    expect(opportunity.status).toBe(401);
  });
});
