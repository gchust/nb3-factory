// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  databaseManagerToken,
  type DatabaseManager,
  type SeedContext,
} from '@nocobase/db';
import type { Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import salesSeed from '../../database/main/seeds/202610030002_seed_sales_management.js';
import {
  salesServiceToken,
  type SalesService,
} from '../../server/providers/sales.js';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.js';

const SOURCE_ROOT = path.resolve(import.meta.dirname, '../..');
const ADMIN = { username: 'nocobase', password: 'admin123' };

const servers: StandaloneServer[] = [];
const tempDirs: string[] = [];

let uniqueCounter = 0;
function unique(label: string): string {
  uniqueCounter += 1;
  return `${label} ${Date.now()}-${uniqueCounter}`;
}

/** A config file is what tells a standalone run where its SQLite database lives, so tests never touch the repository storage. */
function writeRuntimeTestConfig(directory: string): string {
  const file = path.join(directory, 'config.json');
  writeFileSync(
    file,
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
  return file;
}

async function createInstalledApp(): Promise<StandaloneServer> {
  const directory = mkdtempSync(path.join(tmpdir(), 'sales-management-test-'));
  tempDirs.push(directory);

  const server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: writeRuntimeTestConfig(directory),
    },
    paths: {
      rootDir: SOURCE_ROOT,
      serverDir: path.join(SOURCE_ROOT, 'server'),
      databaseDir: path.join(SOURCE_ROOT, 'database'),
      clientDir: path.join(SOURCE_ROOT, 'dist/client'),
      storageDir: path.join(directory, 'storage'),
    },
  });
  servers.push(server);
  return server;
}

interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
}

describe('sales management', () => {
  let app: StandaloneServer;
  let baseUrl: string;
  let manager: DatabaseManager;
  let sales: SalesService;
  let cookie: string;
  let apiKey: string;

  beforeAll(async () => {
    app = await createInstalledApp();
    baseUrl = `http://localhost${app.application.publicBasePath}`;
    manager = app.application.container.resolve(databaseManagerToken);
    sales = app.application.container.resolve(salesServiceToken);

    const signIn = await app.fetch(
      new Request(`${baseUrl}/api/auth/sign-in/username`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ADMIN),
      }),
    );
    if (signIn.status !== 200) {
      throw new Error(`Sign-in failed with status ${signIn.status}.`);
    }
    cookie = signIn.headers
      .getSetCookie()
      .map((header) => header.split(';')[0])
      .join('; ');

    // API-key requests carry no ambient cookie, so the framework's CSRF origin check does not apply to them.
    const created = await app.fetch(
      new Request(`${baseUrl}/api/auth/api-key/create`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'sales-management-test' }),
      }),
    );
    if (created.status !== 200) {
      throw new Error(`API key creation failed with status ${created.status}.`);
    }
    apiKey = ((await created.json()) as { key: string }).key;
  }, 180_000);

  afterAll(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
    for (const directory of tempDirs.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  async function api(
    route: string,
    init: RequestInit = {},
    authenticated = true,
  ): Promise<JsonResponse> {
    const headers = new Headers(init.headers);
    if (authenticated && apiKey) {
      headers.set('x-api-key', apiKey);
    }
    const response = await app.fetch(
      new Request(`${baseUrl}${route}`, { ...init, headers }),
    );
    const text = await response.text();
    return {
      status: response.status,
      body: text === '' ? undefined : (JSON.parse(text) as unknown),
    };
  }

  function data<T>(response: JsonResponse): T {
    return (response.body as { data: T }).data;
  }

  it('applies the schema migration and seeds the sample data', async () => {
    const client = await manager.connection('main').client<Knex>();
    expect(await client.schema.hasTable('customers')).toBe(true);
    expect(await client.schema.hasTable('contacts')).toBe(true);
    expect(await client.schema.hasTable('opportunities')).toBe(true);
    expect(await client.schema.hasColumn('opportunities', 'stage')).toBe(true);

    const customers = await sales.listCustomers();
    expect(customers.map((customer) => customer.name)).toEqual(
      expect.arrayContaining([
        'Northwind Precision Works',
        'Bluepeak Software',
      ]),
    );

    const northwind = await sales.listCustomers({ search: 'Northwind' });
    expect(northwind).toHaveLength(1);
    const detail = await sales.getCustomer(northwind[0].id);
    expect(detail?.contacts.map((contact) => contact.name).sort()).toEqual([
      'Li Na',
      'Zhang Wei',
    ]);
    expect(detail?.opportunities).toHaveLength(2);
    // 480000 + 1200000
    expect(detail?.opportunityAmountTotal).toBe(1680000);

    const bluepeak = await sales.listCustomers({ search: 'Bluepeak' });
    expect(bluepeak).toHaveLength(1);
    const bluepeakDetail = await sales.getCustomer(bluepeak[0].id);
    expect(bluepeakDetail?.contacts).toHaveLength(1);
    expect(bluepeakDetail?.opportunities).toHaveLength(1);
    expect(bluepeakDetail?.opportunityAmountTotal).toBe(260000);
  });

  it('re-runs the seed without duplicating or overwriting records', async () => {
    const before = await manager.repository('customers').findMany({
      filter: { name: 'Northwind Precision Works' },
    });
    expect(before).toHaveLength(1);
    const beforeIndustry = before[0].industry;

    // Re-run the very definition the application executes, not a copy of its rules.
    await salesSeed.run({
      repository: (collection: string) => manager.repository(collection),
    } as unknown as SeedContext);

    const after = await manager.repository('customers').findMany({
      filter: { name: 'Northwind Precision Works' },
    });
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].industry).toBe(beforeIndustry);
    expect(await manager.repository('contacts').count()).toBe(3);
    expect(await manager.repository('opportunities').count()).toBe(3);
  });

  it('requires a signed-in user for every sales endpoint', async () => {
    for (const route of [
      '/api/sales/customers',
      '/api/sales/contacts',
      '/api/sales/opportunities',
    ]) {
      const response = await api(route, {}, false);
      expect(response.status).toBe(401);
    }
  });

  it('creates, edits, lists and filters records over HTTP', async () => {
    const customerName = unique('Acceptance Customer');
    const created = await api('/api/sales/customers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: customerName, industry: 'Testing' }),
    });
    expect(created.status).toBe(201);
    const customer = data<{ id: number; name: string }>(created);
    expect(customer.name).toBe(customerName);

    const renamed = await api(`/api/sales/customers/${customer.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ industry: 'Quality Assurance' }),
    });
    expect(renamed.status).toBe(200);
    expect(data<{ industry: string }>(renamed).industry).toBe(
      'Quality Assurance',
    );

    const contact = await api('/api/sales/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: unique('Contact'),
        phone: '+86 138 0000 9999',
        email: 'contact@example.test',
        customerId: customer.id,
      }),
    });
    expect(contact.status).toBe(201);
    expect(data<{ customerId: number }>(contact).customerId).toBe(customer.id);

    const opportunityName = unique('Opportunity');
    const opportunity = await api('/api/sales/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: opportunityName,
        customerId: customer.id,
        amount: 1234.56,
        stage: 'won',
      }),
    });
    expect(opportunity.status).toBe(201);
    const opportunityId = data<{ id: number }>(opportunity).id;

    const updated = await api(`/api/sales/opportunities/${opportunityId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 4321.5, stage: 'lost' }),
    });
    expect(updated.status).toBe(200);
    expect(data<{ amount: number; stage: string }>(updated)).toMatchObject({
      amount: 4321.5,
      stage: 'lost',
    });

    const wonList = await api('/api/sales/opportunities?stage=won');
    expect(wonList.status).toBe(200);
    const wonNames = data<{ name: string }[]>(wonList).map((row) => row.name);
    expect(wonNames).not.toContain(opportunityName);

    const byCustomer = await api(
      `/api/sales/opportunities?customerId=${customer.id}`,
    );
    const rows = data<{ name: string; amount: number }[]>(byCustomer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: opportunityName, amount: 4321.5 });

    const detail = await api(`/api/sales/customers/${customer.id}`);
    expect(detail.status).toBe(200);
    expect(
      data<{ opportunityAmountTotal: number }>(detail).opportunityAmountTotal,
    ).toBe(4321.5);

    // The data is committed, so a fresh sign-in sees it too.
    const secondSignIn = await app.fetch(
      new Request(`${baseUrl}/api/auth/sign-in/username`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ADMIN),
      }),
    );
    const freshCookie = secondSignIn.headers
      .getSetCookie()
      .map((header) => header.split(';')[0])
      .join('; ');
    const reloaded = await app.fetch(
      new Request(`${baseUrl}/api/sales/customers/${customer.id}`, {
        headers: { cookie: freshCookie },
      }),
    );
    expect(reloaded.status).toBe(200);
    const reloadedBody = (await reloaded.json()) as {
      data: { name: string; opportunityAmountTotal: number };
    };
    expect(reloadedBody.data.name).toBe(customerName);
    expect(reloadedBody.data.opportunityAmountTotal).toBe(4321.5);

    // Clean up so the delete assertion below starts from a customer with no children.
    expect(
      (
        await api(`/api/sales/opportunities/${opportunityId}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(200);
  });

  it('rejects invalid payloads with a stable code', async () => {
    const blankName = await api('/api/sales/customers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    expect(blankName.status).toBe(400);
    expect(blankName.body).toMatchObject({ code: 'CUSTOMER_NAME_REQUIRED' });

    const missingCustomer = await api('/api/sales/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'No Owner' }),
    });
    expect(missingCustomer.status).toBe(400);
    expect(missingCustomer.body).toMatchObject({
      code: 'CONTACT_CUSTOMER_REQUIRED',
    });

    const customer = await sales.createCustomer({
      name: unique('Validation Customer'),
    });

    const negative = await api('/api/sales/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Negative',
        customerId: customer.id,
        amount: -1,
      }),
    });
    expect(negative.status).toBe(400);
    expect(negative.body).toMatchObject({ code: 'INVALID_AMOUNT' });

    const badStage = await api('/api/sales/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad stage',
        customerId: customer.id,
        amount: 10,
        stage: 'closed',
      }),
    });
    expect(badStage.status).toBe(400);
    expect(badStage.body).toMatchObject({ code: 'INVALID_STAGE' });

    const unknownStageFilter = await api(
      '/api/sales/opportunities?stage=closed',
    );
    expect(unknownStageFilter.status).toBe(400);
    expect(unknownStageFilter.body).toMatchObject({ code: 'INVALID_STAGE' });

    const missing = await api('/api/sales/customers/999999', {}, false);
    expect(missing.status).toBe(401);
  });

  it('translates a business error into the request locale', async () => {
    // The route returns a stable `code` alongside a message rendered from the application's server locale files under
    // its own namespace. A caller reading only the message still gets its language, and the code stays constant.
    const response = await api('/api/sales/customers', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept-language': 'zh-CN',
      },
      body: JSON.stringify({ name: '   ' }),
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'CUSTOMER_NAME_REQUIRED',
      message: '客户名称不能为空。',
    });
  });

  it('does not leak another customer’s opportunities into a detail total', async () => {
    const alpha = await sales.createCustomer({ name: unique('Alpha') });
    const beta = await sales.createCustomer({ name: unique('Beta') });
    await sales.createOpportunity({
      name: unique('Alpha deal'),
      customerId: alpha.id,
      amount: 100,
      stage: 'following_up',
    });
    await sales.createOpportunity({
      name: unique('Beta deal'),
      customerId: beta.id,
      amount: 200,
      stage: 'following_up',
    });

    const alphaDetail = await sales.getCustomer(alpha.id);
    expect(alphaDetail?.opportunityAmountTotal).toBe(100);
    expect(alphaDetail?.opportunities).toHaveLength(1);
    expect(alphaDetail?.opportunities[0].customerId).toBe(alpha.id);

    const betaDetail = await sales.getCustomer(beta.id);
    expect(betaDetail?.opportunityAmountTotal).toBe(200);

    const alphaList = await sales.listOpportunities({ customerId: alpha.id });
    expect(alphaList).toHaveLength(1);
    expect(alphaList.every((row) => row.customerId === alpha.id)).toBe(true);
  });

  it('refuses to delete a customer that still has contacts or opportunities', async () => {
    const customer = await sales.createCustomer({
      name: unique('Busy Customer'),
    });
    await sales.createContact({
      name: unique('Busy Contact'),
      customerId: customer.id,
    });

    const blocked = await api(`/api/sales/customers/${customer.id}`, {
      method: 'DELETE',
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({
      code: 'CUSTOMER_HAS_RELATED_RECORDS',
    });

    const contacts = await sales.listContacts({ customerId: customer.id });
    for (const contact of contacts) {
      await api(`/api/sales/contacts/${contact.id}`, { method: 'DELETE' });
    }

    const deleted = await api(`/api/sales/customers/${customer.id}`, {
      method: 'DELETE',
    });
    expect(deleted.status).toBe(200);
    expect(await sales.getCustomer(customer.id)).toBeUndefined();
  });
});
