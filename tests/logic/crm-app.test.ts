// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  databaseManagerToken,
  type DatabaseManager,
  type SeedContext,
} from '@nocobase/db';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';
import crmSeed from '../../database/main/seeds/202609290002_seed_crm_sample_data.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

interface CustomerJson {
  id: number;
  name: string;
  industry: string | null;
}

interface ContactJson {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  customerId: number;
  customerName: string | null;
}

interface OpportunityJson {
  id: number;
  name: string;
  customerId: number;
  customerName: string | null;
  amount: number;
  stage: string;
}

interface CustomerDetailJson {
  customer: CustomerJson;
  contacts: ContactJson[];
  opportunities: OpportunityJson[];
  totalExpectedAmount: number;
}

let cleanupDir = '';
let server: StandaloneServer | undefined;
let database: DatabaseManager;
let cookie = '';
let baseUrl = '';

describe('CRM application', () => {
  beforeAll(async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'nocobase-crm-app-test-'),
    );
    cleanupDir = directory;

    const configFile = path.join(directory, 'config.json');
    writeFileSync(
      configFile,
      JSON.stringify({
        auth: { secret: 'test-auth-secret-at-least-32-characters' },
        database: {
          default: 'main',
          connections: {
            main: {
              dialect: 'sqlite',
              filename: path.join(directory, 'database.sqlite'),
            },
          },
          migrations: { autoRun: true },
          seeds: { autoRun: true },
        },
        hub: { host: { enabled: false } },
      }),
    );

    const sourceRoot = path.resolve(import.meta.dirname, '../..');
    server = await createStandaloneServer({
      env: {
        DB_DIALECT: 'sqlite',
        DB_MIGRATIONS_AUTO_RUN: 'true',
        DB_SEEDS_AUTO_RUN: 'true',
        APP_PUBLIC_ORIGIN: 'http://localhost',
        APP_CONFIG_FILE: configFile,
      },
      paths: {
        rootDir: sourceRoot,
        serverDir: path.join(sourceRoot, 'server'),
        databaseDir: path.join(sourceRoot, 'database'),
        clientDir: path.join(sourceRoot, 'dist/client'),
        storageDir: path.join(sourceRoot, 'storage'),
      },
    });

    database = server.application.container.resolve(databaseManagerToken);
    baseUrl = `http://localhost${server.application.publicBasePath}`;
    cookie = await signIn(server, baseUrl);
  });

  afterAll(async () => {
    await server?.close();
    rmSync(cleanupDir, { recursive: true, force: true });
  });

  it('rejects anonymous access to every CRM endpoint', async () => {
    for (const endpoint of [
      'customers',
      'contacts',
      'opportunities',
      'customers/1/detail',
    ]) {
      const response = await requestApp(
        server!,
        `${baseUrl}/api/crm/${endpoint}`,
      );
      expect(response.status).toBe(401);
    }
  });

  it('exposes the seeded customers, contacts and opportunities', async () => {
    const customers = await getJson<{ data: CustomerJson[] }>(
      `${baseUrl}/api/crm/customers`,
    );
    expect(customers.data).toHaveLength(2);
    expect(customers.data.map((row) => row.name).sort()).toEqual(
      ['星海科技', '晨光贸易'].sort(),
    );

    const contacts = await getJson<{ data: ContactJson[] }>(
      `${baseUrl}/api/crm/contacts`,
    );
    expect(contacts.data).toHaveLength(3);
    expect(contacts.data.map((row) => row.customerName)).toContain('星海科技');

    const opportunities = await getJson<{ data: OpportunityJson[] }>(
      `${baseUrl}/api/crm/opportunities`,
    );
    expect(opportunities.data).toHaveLength(3);
    expect(opportunities.data.map((row) => row.stage).sort()).toEqual([
      'follow_up',
      'lost',
      'won',
    ]);
  });

  it('creates a customer, a contact and an opportunity', async () => {
    const customer = await postJson<{ data: CustomerJson }>(
      `${baseUrl}/api/crm/customers`,
      { name: '云图传媒', industry: '文化传媒' },
    );
    expect(customer.data.name).toBe('云图传媒');

    const contact = await postJson<{ data: ContactJson }>(
      `${baseUrl}/api/crm/contacts`,
      {
        name: '赵敏',
        customerId: customer.data.id,
        phone: '13900000009',
        email: 'zhaomin@yuntu.example.com',
      },
    );
    expect(contact.data.customerName).toBe('云图传媒');

    const opportunity = await postJson<{ data: OpportunityJson }>(
      `${baseUrl}/api/crm/opportunities`,
      {
        name: '云图品牌官网',
        customerId: customer.data.id,
        amount: 66000,
        stage: 'follow_up',
      },
    );
    expect(opportunity.data.amount).toBe(66000);
  });

  it('summarizes a customer with its contacts, opportunities and total amount', async () => {
    const customers = await getJson<{ data: CustomerJson[] }>(
      `${baseUrl}/api/crm/customers?search=星海`,
    );
    expect(customers.data).toHaveLength(1);
    const customerId = customers.data[0].id;

    const detail = await getJson<{ data: CustomerDetailJson }>(
      `${baseUrl}/api/crm/customers/${customerId}/detail`,
    );

    expect(detail.data.customer.name).toBe('星海科技');
    expect(detail.data.contacts).toHaveLength(2);
    expect(detail.data.opportunities).toHaveLength(2);
    // 120000 (follow_up) + 80000 (won) belongs to this customer only.
    expect(detail.data.totalExpectedAmount).toBe(200000);
  });

  it('updates an opportunity amount and reflects it in the customer total', async () => {
    const opportunities = await getJson<{ data: OpportunityJson[] }>(
      `${baseUrl}/api/crm/opportunities?search=数据中台`,
    );
    const target = opportunities.data[0];
    expect(target).toBeDefined();

    const updated = await patchJson<{ data: OpportunityJson }>(
      `${baseUrl}/api/crm/opportunities/${target.id}`,
      { amount: 90000 },
    );
    expect(updated.data.amount).toBe(90000);

    const detail = await getJson<{ data: CustomerDetailJson }>(
      `${baseUrl}/api/crm/customers/${target.customerId}/detail`,
    );
    expect(detail.data.totalExpectedAmount).toBe(210000);
  });

  it('filters the opportunity list by stage', async () => {
    const won = await getJson<{ data: OpportunityJson[] }>(
      `${baseUrl}/api/crm/opportunities?stage=won`,
    );
    expect(won.data.length).toBeGreaterThan(0);
    expect(won.data.every((row) => row.stage === 'won')).toBe(true);

    const none = await getJson<{ data: OpportunityJson[] }>(
      `${baseUrl}/api/crm/opportunities?stage=does-not-exist`,
    );
    expect(none.data).toEqual([]);
  });

  it('rejects invalid input without writing anything', async () => {
    const missingName = await mutateJson(
      `${baseUrl}/api/crm/customers`,
      'POST',
      { industry: '无名称' },
    );
    expect(missingName.status).toBe(400);

    const negativeAmount = await mutateJson(
      `${baseUrl}/api/crm/opportunities`,
      'POST',
      { name: '负金额商机', customerId: 1, amount: -1, stage: 'follow_up' },
    );
    expect(negativeAmount.status).toBe(400);

    const invalidStage = await mutateJson(
      `${baseUrl}/api/crm/opportunities`,
      'POST',
      { name: '非法阶段', customerId: 1, amount: 10, stage: 'nope' },
    );
    expect(invalidStage.status).toBe(400);

    const unknownCustomer = await mutateJson(
      `${baseUrl}/api/crm/contacts`,
      'POST',
      { name: '无客户联系人', customerId: 999999 },
    );
    expect(unknownCustomer.status).toBe(404);

    const missingOpportunity = await mutateJson(
      `${baseUrl}/api/crm/opportunities/999999`,
      'PATCH',
      { amount: 1 },
    );
    expect(missingOpportunity.status).toBe(404);
  });

  it('keeps the seed idempotent and preserves edited values', async () => {
    const customers = database.repository<{ id: number }>('customers');
    const contacts = database.repository<{ id: number }>('contacts');
    const opportunities = database.repository<{
      id: number;
      name: string;
      amount: string | number;
    }>('opportunities');

    const customerCount = await customers.count();
    const contactCount = await contacts.count();
    const opportunityCount = await opportunities.count();

    const target = await opportunities.findOne({
      filter: { name: '星海科技 ERP 升级' },
    });

    if (!target) {
      throw new Error('Seeded opportunity was not found.');
    }

    await opportunities.updateOne({
      filter: { id: target.id },
      values: { amount: 123456 },
    });

    await crmSeed.run(createSeedContext(database));

    expect(await customers.count()).toBe(customerCount);
    expect(await contacts.count()).toBe(contactCount);
    expect(await opportunities.count()).toBe(opportunityCount);

    const after = await opportunities.findOne({ filter: { id: target.id } });
    // A repeat run finds the record and skips creation, so a user edit survives.
    expect(Number(after?.amount)).toBe(123456);
  });
});

function createSeedContext(databaseManager: DatabaseManager): SeedContext {
  return {
    config: {},
    container: {
      has: () => false,
      resolve: () => {
        throw new Error('No services are available to a seed in this test.');
      },
      resolveIfCreated: () => undefined,
    },
    repository: (collection: string) => databaseManager.repository(collection),
    query: databaseManager.query(),
    connection: databaseManager.connection(),
  } as unknown as SeedContext;
}

function requestApp(
  target: StandaloneServer,
  input: string,
  requestInit?: RequestInit,
): Promise<Response> {
  return Promise.resolve(target.fetch(new Request(input, requestInit)));
}

async function signIn(target: StandaloneServer, url: string): Promise<string> {
  const response = await requestApp(
    target,
    `${url}/api/auth/sign-in/username`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
    },
  );
  expect(response.status).toBe(200);

  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

async function getJson<T>(url: string): Promise<T> {
  const response = await requestApp(server!, url, { headers: { cookie } });
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await mutateJson(url, 'POST', body);
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const response = await mutateJson(url, 'PATCH', body);
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

function mutateJson(
  url: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<Response> {
  return requestApp(server!, url, {
    method,
    headers: {
      cookie,
      origin: 'http://localhost',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
