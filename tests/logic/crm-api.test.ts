// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

const sourceRoot = path.resolve(import.meta.dirname, '../..');
const tempDirs: string[] = [];
let server: StandaloneServer;
let baseUrl: string;
let cookie: string;

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

async function startServer(): Promise<StandaloneServer> {
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'crm-api-standalone-database-'),
  );
  tempDirs.push(databaseDir);
  const configFile = path.join(databaseDir, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      app: { publicOrigin: 'http://localhost' },
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
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: configFile,
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: databaseDir,
    },
  });
}

interface ApiCall {
  readonly method?: string;
  readonly json?: unknown;
  readonly cookie?: string;
  readonly authenticated?: boolean;
}

async function api(route: string, call: ApiCall = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  const session = call.cookie ?? (call.authenticated === false ? '' : cookie);
  if (session) headers.cookie = session;
  if (call.json !== undefined) headers['content-type'] = 'application/json';
  const method = call.method ?? 'GET';
  // A cookie-bearing write must carry a trusted Origin or the authentication plugin rejects it as CSRF.
  if (method !== 'GET' && method !== 'HEAD')
    headers.origin = 'http://localhost';
  return server.fetch(
    new Request(`${baseUrl}/api/${route}`, {
      method,
      headers,
      ...(call.json === undefined ? {} : { body: JSON.stringify(call.json) }),
    }),
  );
}

async function signIn(): Promise<string> {
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

beforeAll(async () => {
  server = await startServer();
  baseUrl = `http://localhost${server.application.publicBasePath}`;
  cookie = await signIn();
}, 120_000);

afterAll(async () => {
  await server?.close();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('CRM API authentication', () => {
  // The application has a single sales group with no per-resource authorization rules, so an
  // authenticated-but-unpermitted request cannot exist: once the session is valid, every CRM
  // operation is allowed. The negative cases are therefore the two authentication failures
  // below — no session, and a session cookie that does not resolve.
  it('refuses every CRM endpoint without a session', async () => {
    for (const route of [
      'customers',
      'contacts',
      'opportunities',
      'customers/1',
    ]) {
      const response = await api(route, { authenticated: false });
      expect(response.status).toBe(401);
    }
  });

  it('refuses a write with an invalid session', async () => {
    const response = await api('customers', {
      method: 'POST',
      json: { name: '未授权客户' },
      cookie: `${cookie.split('=')[0]}=not-a-real-token`,
    });
    expect(response.status).toBe(401);
  });

  it('serves the signed-in session', async () => {
    const response = await api('customers');
    expect(response.status).toBe(200);
  });
});

describe('CRM API data', () => {
  it('returns the seeded records', async () => {
    const customers = (await (await api('customers')).json()) as {
      data: { name: string }[];
    };
    expect(customers.data).toHaveLength(2);

    const contacts = (await (await api('contacts')).json()) as {
      data: unknown[];
    };
    expect(contacts.data).toHaveLength(3);

    const opportunities = (await (await api('opportunities')).json()) as {
      data: unknown[];
    };
    expect(opportunities.data).toHaveLength(3);
  });

  it('returns a customer detail with its own contacts, opportunities and amount total', async () => {
    const list = (await (await api('customers')).json()) as {
      data: { id: number; name: string }[];
    };
    const eastChina = list.data.find(
      (customer) => customer.name === '华东制造',
    );
    if (!eastChina) throw new Error('The sample customer is missing.');

    const detail = (await (await api(`customers/${eastChina.id}`)).json()) as {
      data: {
        amountTotal: number;
        contacts: { customerId: number }[];
        opportunities: { customerId: number; amount: number }[];
      };
    };

    // 1,200,000 + 600,000, excluding 星辰科技's 800,000.
    expect(detail.data.amountTotal).toBe(1800000);
    expect(detail.data.contacts).toHaveLength(2);
    expect(detail.data.opportunities).toHaveLength(2);
    expect(
      detail.data.opportunities.every(
        (opportunity) => opportunity.customerId === eastChina.id,
      ),
    ).toBe(true);
  });

  it('filters the opportunity list by stage', async () => {
    const won = (await (await api('opportunities?stage=won')).json()) as {
      data: { name: string; stage: string }[];
    };
    expect(won.data).toHaveLength(1);
    expect(won.data[0]).toMatchObject({
      name: '智能仓储项目',
      stage: 'won',
    });

    const following = (await (
      await api('opportunities?stage=following')
    ).json()) as { data: { stage: string }[] };
    expect(following.data).toHaveLength(2);
    expect(following.data.every((item) => item.stage === 'following')).toBe(
      true,
    );
  });

  it('creates, edits and persists a customer across a new session', async () => {
    const created = await api('customers', {
      method: 'POST',
      json: { name: '持久化客户', industry: '物流' },
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: { id: number; name: string; industry: string | null };
    };
    expect(createdBody.data).toMatchObject({
      name: '持久化客户',
      industry: '物流',
    });

    const updated = await api(`customers/${createdBody.data.id}`, {
      method: 'PATCH',
      json: { industry: '供应链' },
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      data: { name: '持久化客户', industry: '供应链' },
    });

    // A fresh sign-in proves the record is in the database, not the session.
    const nextCookie = await signIn();
    const list = (await (
      await api('customers', { cookie: nextCookie })
    ).json()) as { data: { id: number }[] };
    expect(
      list.data.some((customer) => customer.id === createdBody.data.id),
    ).toBe(true);
  });

  it('creates a contact for an existing customer', async () => {
    const list = (await (await api('customers')).json()) as {
      data: { id: number; name: string }[];
    };
    const star = list.data.find((customer) => customer.name === '星辰科技');
    if (!star) throw new Error('The sample customer is missing.');

    const created = await api('contacts', {
      method: 'POST',
      json: {
        name: '赵敏',
        contact: 'zhaomin@starlight.example',
        customerId: star.id,
      },
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      data: { name: '赵敏', customerId: star.id },
    });

    const contacts = (await (
      await api(`contacts?customerId=${star.id}`)
    ).json()) as { data: unknown[] };
    expect(contacts.data).toHaveLength(2);
  });

  it('updates the amount total when an opportunity is edited', async () => {
    const list = (await (await api('customers')).json()) as {
      data: { id: number; name: string }[];
    };
    const star = list.data.find((customer) => customer.name === '星辰科技');
    if (!star) throw new Error('The sample customer is missing.');

    const created = await api('opportunities', {
      method: 'POST',
      json: {
        name: '新增机会',
        customerId: star.id,
        amount: 100000,
        stage: 'following',
      },
    });
    expect(created.status).toBe(201);
    const opportunity = (await created.json()) as { data: { id: number } };

    const before = (await (await api(`customers/${star.id}`)).json()) as {
      data: { amountTotal: number };
    };
    expect(before.data.amountTotal).toBe(900000);

    const updated = await api(`opportunities/${opportunity.data.id}`, {
      method: 'PATCH',
      json: { amount: 150000 },
    });
    expect(updated.status).toBe(200);

    const after = (await (await api(`customers/${star.id}`)).json()) as {
      data: { amountTotal: number };
    };
    expect(after.data.amountTotal).toBe(950000);
  });

  it('rejects a negative amount and an unknown stage with a field', async () => {
    const list = (await (await api('customers')).json()) as {
      data: { id: number }[];
    };
    const customerId = list.data[0]?.id;
    if (!customerId) throw new Error('A sample customer is missing.');

    const negative = await api('opportunities', {
      method: 'POST',
      json: { name: '负数金额', customerId, amount: -1 },
    });
    expect(negative.status).toBe(400);
    await expect(negative.json()).resolves.toMatchObject({ field: 'amount' });

    const badStage = await api('opportunities', {
      method: 'POST',
      json: { name: '无效阶段', customerId, amount: 100, stage: 'pending' },
    });
    expect(badStage.status).toBe(400);
    await expect(badStage.json()).resolves.toMatchObject({ field: 'stage' });
  });

  it('rejects a contact without an existing customer', async () => {
    const response = await api('contacts', {
      method: 'POST',
      json: { name: '无主联系人', customerId: 999999 },
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      field: 'customerId',
    });
  });
});
