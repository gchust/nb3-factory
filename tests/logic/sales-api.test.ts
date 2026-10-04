// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

interface Customer {
  id: number;
  name: string;
  industry: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Contact {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  customerId: number;
}

interface Opportunity {
  id: number;
  name: string;
  customerId: number;
  amount: number;
  stage: string;
}

interface CustomerDetail {
  customer: Customer;
  contacts: Contact[];
  opportunities: Opportunity[];
  totalAmount: number;
}

type RequestInitLike = {
  method?: string;
  body?: unknown;
  cookie?: string;
};

const tempDirs: string[] = [];

describe('sales API', () => {
  let server: StandaloneServer;
  let baseUrl: string;
  let cookie: string;

  beforeAll(async () => {
    server = await createSalesServer();
    baseUrl = `http://localhost${server.application.publicBasePath}`;
    cookie = await signIn(server);
  });

  afterAll(async () => {
    await server.close();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function call(
    method: string,
    pathname: string,
    options: Omit<RequestInitLike, 'method'> = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    const authenticated = options.cookie ?? cookie;
    if (authenticated) {
      headers.cookie = authenticated;
      // A cookie-authenticated write is rejected unless the request names a trusted origin.
      headers.origin = new URL(baseUrl).origin;
    }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    return server.fetch(
      new Request(`${baseUrl}${pathname}`, {
        method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      }),
    );
  }

  async function getData<T>(pathname: string): Promise<T> {
    const response = await call('GET', pathname);
    expect(response.status).toBe(200);
    return ((await response.json()) as { data: T }).data;
  }

  it('rejects an anonymous request', async () => {
    const response = await call('GET', '/api/sales/customers', {
      cookie: '',
    });
    expect(response.status).toBe(401);
  });

  it('serves the seeded sample data', async () => {
    const customers = await getData<Customer[]>('/api/sales/customers');
    expect(customers.map((customer) => customer.name).sort()).toEqual([
      '星辰科技',
      '远山贸易',
    ]);

    const contacts = await getData<Contact[]>('/api/sales/contacts');
    expect(contacts).toHaveLength(3);

    const opportunities = await getData<Opportunity[]>(
      '/api/sales/opportunities',
    );
    expect(opportunities).toHaveLength(3);
  });

  it('shows a customer together with its contacts, opportunities and total amount', async () => {
    const detail = await customerDetailByName('星辰科技');

    expect(detail.contacts.map((contact) => contact.name).sort()).toEqual([
      '张伟',
      '李娜',
    ]);
    expect(
      detail.opportunities.map((opportunity) => opportunity.name).sort(),
    ).toEqual(['企业版年度订阅', '数据平台扩容']);
    // 120000 + 80000, and nothing from 远山贸易.
    expect(detail.totalAmount).toBe(200000);
  });

  it('creates a customer that persists', async () => {
    const created = await call('POST', '/api/sales/customers', {
      body: { name: '青云网络', industry: '互联网' },
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { data: Customer };
    expect(createdBody.data).toMatchObject({
      name: '青云网络',
      industry: '互联网',
    });
    expect(createdBody.data.id).toEqual(expect.any(Number));

    const customers = await getData<Customer[]>('/api/sales/customers');
    expect(customers.some((customer) => customer.name === '青云网络')).toBe(
      true,
    );
  });

  it('creates a contact and an opportunity for a customer and recomputes the total when the amount changes', async () => {
    const customer = await createCustomer('云帆数据', '大数据');

    const contact = await call('POST', '/api/sales/contacts', {
      body: {
        name: '赵敏',
        phone: '13900000001',
        email: 'zhaomin@yunfan.example.com',
        customerId: customer.id,
      },
    });
    expect(contact.status).toBe(201);
    const contactBody = (await contact.json()) as { data: Contact };
    expect(contactBody.data.customerId).toBe(customer.id);

    const opportunity = await call('POST', '/api/sales/opportunities', {
      body: {
        name: '数据仓库项目',
        customerId: customer.id,
        amount: 30000,
        stage: 'following',
      },
    });
    expect(opportunity.status).toBe(201);
    const opportunityBody = (await opportunity.json()) as {
      data: Opportunity;
    };
    expect(opportunityBody.data.amount).toBe(30000);

    const afterCreate = await getData<CustomerDetail>(
      `/api/sales/customers/${customer.id}`,
    );
    expect(afterCreate.contacts.map((item) => item.name)).toEqual(['赵敏']);
    expect(afterCreate.totalAmount).toBe(30000);

    // Editing the amount is reflected in the total, and only this customer's rows contribute.
    const updated = await call(
      'PATCH',
      `/api/sales/opportunities/${opportunityBody.data.id}`,
      { body: { amount: 45000 } },
    );
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as { data: Opportunity }).data.amount).toBe(
      45000,
    );

    const afterUpdate = await getData<CustomerDetail>(
      `/api/sales/customers/${customer.id}`,
    );
    expect(afterUpdate.totalAmount).toBe(45000);

    const other = await customerDetailByName('星辰科技');
    expect(other.totalAmount).toBe(200000);
  });

  it('filters the opportunity list by stage', async () => {
    const won = await getData<Opportunity[]>(
      '/api/sales/opportunities?stage=won',
    );
    expect(won).toHaveLength(1);
    expect(won[0]).toMatchObject({ name: '数据平台扩容', stage: 'won' });

    const lost = await getData<Opportunity[]>(
      '/api/sales/opportunities?stage=lost',
    );
    expect(lost.map((opportunity) => opportunity.stage)).toEqual(['lost']);

    const unknown = await call('GET', '/api/sales/opportunities?stage=pending');
    expect(unknown.status).toBe(400);
  });

  it('rejects invalid input', async () => {
    const missingName = await call('POST', '/api/sales/customers', {
      body: { industry: '软件服务' },
    });
    expect(missingName.status).toBe(400);

    const negativeAmount = await call('POST', '/api/sales/opportunities', {
      body: {
        name: '无效商机',
        customerId: 1,
        amount: -1,
        stage: 'following',
      },
    });
    expect(negativeAmount.status).toBe(400);

    const unknownStage = await call('POST', '/api/sales/opportunities', {
      body: {
        name: '阶段错误',
        customerId: 1,
        amount: 1000,
        stage: 'pending',
      },
    });
    expect(unknownStage.status).toBe(400);
  });

  it('answers 404 for a missing record and 400 for a malformed id', async () => {
    const missing = await call('GET', '/api/sales/customers/999999');
    expect(missing.status).toBe(404);
    expect(
      ((await missing.json()) as { error: { code: string } }).error.code,
    ).toBe('SALES_NOT_FOUND');

    const malformed = await call('GET', '/api/sales/customers/not-a-number');
    expect(malformed.status).toBe(400);
  });

  async function createCustomer(name: string, industry: string) {
    const response = await call('POST', '/api/sales/customers', {
      body: { name, industry },
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as { data: Customer }).data;
  }

  async function customerDetailByName(name: string): Promise<CustomerDetail> {
    const customers = await getData<Customer[]>('/api/sales/customers');
    const customer = customers.find((item) => item.name === name);
    expect(customer, `expected a seeded customer named ${name}`).toBeDefined();
    return getData<CustomerDetail>(`/api/sales/customers/${customer!.id}`);
  }
});

async function createSalesServer(): Promise<StandaloneServer> {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-sales-api-test-'),
  );
  tempDirs.push(databaseDir);

  const configFile = path.join(databaseDir, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(databaseDir, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );

  return createStandaloneServer({
    viteDevUrl: false,
    env: {
      APP_CONFIG_FILE: configFile,
      APP_PUBLIC_ORIGIN: 'http://localhost',
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });
}

async function signIn(server: StandaloneServer): Promise<string> {
  const baseUrl = `http://localhost${server.application.publicBasePath}`;
  const response = await server.fetch(
    new Request(`${baseUrl}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}
