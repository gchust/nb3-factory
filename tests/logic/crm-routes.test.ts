// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.js';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const resources: { close(): Promise<void> }[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(resources.splice(0).map((resource) => resource.close()));
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('CRM API routes', () => {
  let app: StandaloneServer;
  let baseUrl: string;

  beforeEach(async () => {
    const sourceRoot = path.resolve(import.meta.dirname, '../..');
    const directory = mkdtempSync(path.join(tmpdir(), 'nocobase-crm-routes-'));
    tempDirs.push(directory);
    const clientDir = path.join(directory, 'client');
    mkdirSync(clientDir, { recursive: true });
    writeFileSync(
      path.join(clientDir, 'index.html'),
      '<main>CRM route test</main>',
    );
    const configFile = writeTestConfig(directory);

    app = await createStandaloneServer({
      env: {
        DB_DIALECT: 'sqlite',
        DB_MIGRATIONS_AUTO_RUN: 'true',
        DB_SEEDS_AUTO_RUN: 'true',
        // A browser sends Origin on cookie-authenticated writes, and the server trusts it only when the public origin is
        // configured; production sets this behind its reverse proxy.
        APP_PUBLIC_ORIGIN: 'http://localhost',
        APP_CONFIG_FILE: configFile,
      },
      paths: {
        rootDir: sourceRoot,
        serverDir: path.join(sourceRoot, 'server'),
        databaseDir: path.join(sourceRoot, 'database'),
        clientDir,
        storageDir: path.join(sourceRoot, 'storage'),
      },
    });
    resources.push(app);
    baseUrl = `http://localhost${app.application.publicBasePath}`;
  });

  it('rejects anonymous requests', async () => {
    const response = await request(app, `${baseUrl}/api/crm/customers`);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('serves the seeded records scoped to each signed-in customer', async () => {
    const cookie = await signIn(app, baseUrl);

    const list = await request(app, `${baseUrl}/api/crm/customers`, {
      headers: { cookie },
    });
    expect(list.status).toBe(200);
    const customers = (await list.json()).data as {
      id: number;
      name: string;
      opportunityTotal: number;
    }[];
    expect(customers).toHaveLength(2);
    const star = customers.find((customer) => customer.name === '星辰科技');
    expect(star?.opportunityTotal).toBe(200000);

    const detail = await request(
      app,
      `${baseUrl}/api/crm/customers/${star!.id}`,
      { headers: { cookie } },
    );
    expect(detail.status).toBe(200);
    const body = (await detail.json()).data as {
      contacts: { customerId: number }[];
      opportunities: { customerId: number }[];
      opportunityTotal: number;
    };
    expect(body.contacts).toHaveLength(2);
    expect(body.opportunities).toHaveLength(2);
    expect(body.opportunityTotal).toBe(200000);
    expect(
      body.opportunities.every(
        (opportunity) => opportunity.customerId === star!.id,
      ),
    ).toBe(true);
  });

  it('creates records and keeps the total in step with amount edits', async () => {
    const cookie = await signIn(app, baseUrl);
    const headers = {
      cookie,
      'content-type': 'application/json',
      origin: new URL(baseUrl).origin,
    };

    const createdCustomer = await request(app, `${baseUrl}/api/crm/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: '云端动力', industry: '云计算' }),
    });
    expect(createdCustomer.status).toBe(201);
    const customer = (await createdCustomer.json()).data as {
      id: number;
      name: string;
    };
    expect(customer.name).toBe('云端动力');

    const createdOpportunity = await request(
      app,
      `${baseUrl}/api/crm/opportunities`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: '云服务采购',
          customerId: customer.id,
          amount: 25000.5,
          stage: 'following',
        }),
      },
    );
    expect(createdOpportunity.status).toBe(201);
    const opportunity = (await createdOpportunity.json()).data as {
      id: number;
      amount: number;
    };
    expect(opportunity.amount).toBe(25000.5);

    const afterCreate = await request(
      app,
      `${baseUrl}/api/crm/customers/${customer.id}`,
      { headers: { cookie } },
    );
    expect((await afterCreate.json()).data.opportunityTotal).toBe(25000.5);

    const updated = await request(
      app,
      `${baseUrl}/api/crm/opportunities/${opportunity.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ amount: 40000 }),
      },
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.amount).toBe(40000);

    const afterEdit = await request(
      app,
      `${baseUrl}/api/crm/customers/${customer.id}`,
      { headers: { cookie } },
    );
    expect((await afterEdit.json()).data.opportunityTotal).toBe(40000);

    // Editing one customer's opportunity must not move another customer's total.
    const list = await request(app, `${baseUrl}/api/crm/customers`, {
      headers: { cookie },
    });
    const blue = (
      (await list.json()).data as {
        name: string;
        opportunityTotal: number;
      }[]
    ).find((entry) => entry.name === '蓝海贸易');
    expect(blue?.opportunityTotal).toBe(50000);
  });

  it('rejects invalid input and reports a missing record', async () => {
    const cookie = await signIn(app, baseUrl);
    const headers = {
      cookie,
      'content-type': 'application/json',
      origin: new URL(baseUrl).origin,
    };

    const blankName = await request(app, `${baseUrl}/api/crm/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: '   ' }),
    });
    expect(blankName.status).toBe(400);
    expect((await blankName.json()).code).toBe('CUSTOMER_NAME_REQUIRED');

    const negativeAmount = await request(
      app,
      `${baseUrl}/api/crm/opportunities`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: '负金额', customerId: 1, amount: -1 }),
      },
    );
    expect(negativeAmount.status).toBe(400);

    const missing = await request(app, `${baseUrl}/api/crm/customers/999999`, {
      headers: { cookie },
    });
    expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe('CUSTOMER_NOT_FOUND');
  });
});

function request(
  app: StandaloneServer,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  return app.fetch(new Request(input, init));
}

async function signIn(app: StandaloneServer, baseUrl: string): Promise<string> {
  const response = await request(app, `${baseUrl}/api/auth/sign-in/username`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

function writeTestConfig(directory: string): string {
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
