// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Application } from '@nocobase/app-server/application';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Context } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202610020001_create_sales_crm.ts';
import {
  createCrmService,
  crmServiceToken,
  type Customer,
  type CustomerDetail,
  type Opportunity,
} from '../../server/providers/crm.ts';
import { apiRoutes } from '../../server/routes/crm.ts';

const managers: DatabaseManager[] = [];
const tempDirs: string[] = [];

async function createTestDatabase(): Promise<DatabaseManager> {
  const dir = mkdtempSync(path.join(tmpdir(), 'crm-api-'));
  tempDirs.push(dir);
  const manager = createDatabaseManager({
    default: 'main',
    connections: {
      main: sqlite({ filename: path.join(dir, 'test.sqlite') }),
    },
  });
  managers.push(manager);
  await manager.connect();
  const context = {
    config: { get: () => undefined },
    container: new ServiceContainer(),
    builder: manager.builder(),
    query: manager.query(),
    repository: <TRecord extends object>(collection: string) =>
      manager.repository<TRecord>(collection),
    connection: manager.connection(),
  } as unknown as Parameters<typeof migration.up>[0];
  await migration.up(context);
  return manager;
}

/**
 * Replaces the authentication service with one that answers to an `x-test-user`
 * header, so the routes' own `auth.required()` middleware is what is exercised.
 */
function createTestApp(database: DatabaseManager): Application {
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  container.instance(crmServiceToken, createCrmService(database));
  container.instance(authenticationToken, {
    required: () => async (context: Context, next: () => Promise<void>) => {
      if (context.req.header('x-test-user') !== 'tester') {
        return context.json(
          { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
          401,
        );
      }
      await next();
    },
  } as never);
  return { container } as unknown as Application;
}

type Router = Awaited<ReturnType<typeof apiRoutes.createRouter>>;

async function createRouter(database: DatabaseManager): Promise<Router> {
  return apiRoutes.createRouter(createTestApp(database));
}

interface RequestOptions {
  readonly method?: string;
  readonly json?: unknown;
  readonly anonymous?: boolean;
}

async function request(
  router: Router,
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (!options.anonymous) headers['x-test-user'] = 'tester';
  if (options.json !== undefined) headers['content-type'] = 'application/json';
  return router.request(path, {
    method: options.method ?? 'GET',
    headers,
    ...(options.json === undefined
      ? {}
      : { body: JSON.stringify(options.json) }),
  });
}

async function createCustomer(
  router: Router,
  name: string,
  industry?: string,
): Promise<Customer> {
  const response = await request(router, '/customers', {
    method: 'POST',
    json: { name, industry },
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: Customer }).data;
}

async function detail(router: Router, id: number): Promise<CustomerDetail> {
  const response = await request(router, `/customers/${id}`);
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: CustomerDetail }).data;
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.destroy()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('sales CRM routes', () => {
  it('rejects anonymous requests', async () => {
    const router = await createRouter(await createTestDatabase());
    for (const path of ['/customers', '/contacts', '/opportunities']) {
      const response = await request(router, path, { anonymous: true });
      expect(response.status).toBe(401);
    }
  });

  it('records a contact on the customer it belongs to and keeps it after a re-read', async () => {
    const router = await createRouter(await createTestDatabase());
    const acme = await createCustomer(router, 'Acme', 'Manufacturing');
    const globex = await createCustomer(router, 'Globex', 'Technology');

    const created = await request(router, '/contacts', {
      method: 'POST',
      json: { name: 'Alice', email: 'alice@example.com', customerId: acme.id },
    });
    expect(created.status).toBe(201);

    const acmeDetail = await detail(router, acme.id);
    expect(acmeDetail.contacts).toHaveLength(1);
    expect(acmeDetail.contacts[0]?.name).toBe('Alice');
    expect(acmeDetail.contacts[0]?.customer?.name).toBe('Acme');

    // The other customer did not acquire the contact.
    expect((await detail(router, globex.id)).contacts).toHaveLength(0);

    // A fresh read (the equivalent of a refresh) still returns it.
    expect((await detail(router, acme.id)).contacts[0]?.email).toBe(
      'alice@example.com',
    );
  });

  it('totals only a customer’s own opportunities and follows amount and stage edits', async () => {
    const router = await createRouter(await createTestDatabase());
    const acme = await createCustomer(router, 'Acme');
    const globex = await createCustomer(router, 'Globex');

    const created = await request(router, '/opportunities', {
      method: 'POST',
      json: { name: 'First deal', customerId: acme.id, amount: 100 },
    });
    expect(created.status).toBe(201);
    const opportunity = ((await created.json()) as { data: Opportunity }).data;
    expect(opportunity.stage).toBe('follow_up');

    // B02: the owning customer gains 100, the other stays at 0.
    expect((await detail(router, acme.id)).opportunityTotal).toBe(100);
    expect((await detail(router, globex.id)).opportunityTotal).toBe(0);

    // A second customer's opportunity must never enter the first total.
    await request(router, '/opportunities', {
      method: 'POST',
      json: { name: 'Other deal', customerId: globex.id, amount: 500 },
    });
    expect((await detail(router, acme.id)).opportunityTotal).toBe(100);
    expect((await detail(router, globex.id)).opportunityTotal).toBe(500);

    // B03: moving to "won" moves it between the stage filters.
    const won = await request(router, `/opportunities/${opportunity.id}`, {
      method: 'PATCH',
      json: { stage: 'won' },
    });
    expect(won.status).toBe(200);

    const wonList = (await (
      await request(router, '/opportunities?stage=won')
    ).json()) as { data: Opportunity[] };
    expect(wonList.data.map((row) => row.name)).toContain('First deal');
    const followUpList = (await (
      await request(router, '/opportunities?stage=follow_up')
    ).json()) as { data: Opportunity[] };
    expect(followUpList.data.map((row) => row.name)).not.toContain(
      'First deal',
    );

    // B04: raising 100 to 150 raises the total by exactly 50.
    const raised = await request(router, `/opportunities/${opportunity.id}`, {
      method: 'PATCH',
      json: { amount: 150 },
    });
    expect(raised.status).toBe(200);
    expect((await detail(router, acme.id)).opportunityTotal).toBe(150);
    expect((await detail(router, globex.id)).opportunityTotal).toBe(500);
  });

  it('explains invalid input with the field that must be corrected', async () => {
    const router = await createRouter(await createTestDatabase());
    const acme = await createCustomer(router, 'Acme');

    const missingName = await request(router, '/customers', {
      method: 'POST',
      json: { industry: 'Manufacturing' },
    });
    expect(missingName.status).toBe(400);
    expect(
      ((await missingName.json()) as { error: { field: string } }).error.field,
    ).toBe('name');

    const missingCustomer = await request(router, '/contacts', {
      method: 'POST',
      json: { name: 'No owner' },
    });
    expect(missingCustomer.status).toBe(400);
    expect(
      ((await missingCustomer.json()) as { error: { field: string } }).error
        .field,
    ).toBe('customerId');

    const unknownCustomer = await request(router, '/contacts', {
      method: 'POST',
      json: { name: 'Ghost owner', customerId: 9999 },
    });
    expect(unknownCustomer.status).toBe(400);

    const negative = await request(router, '/opportunities', {
      method: 'POST',
      json: { name: 'Negative', customerId: acme.id, amount: -1 },
    });
    expect(negative.status).toBe(400);
    expect(
      ((await negative.json()) as { error: { field: string } }).error.field,
    ).toBe('amount');

    const badStage = await request(router, '/opportunities', {
      method: 'POST',
      json: {
        name: 'Bad stage',
        customerId: acme.id,
        amount: 10,
        stage: 'maybe',
      },
    });
    expect(badStage.status).toBe(400);
    expect(
      ((await badStage.json()) as { error: { field: string } }).error.field,
    ).toBe('stage');

    const invalidStageFilter = await request(
      router,
      '/opportunities?stage=maybe',
    );
    expect(invalidStageFilter.status).toBe(400);

    // Correcting the input saves normally.
    const corrected = await request(router, '/opportunities', {
      method: 'POST',
      json: {
        name: 'Corrected',
        customerId: acme.id,
        amount: 10,
        stage: 'won',
      },
    });
    expect(corrected.status).toBe(201);
  });

  it('returns 404 for a customer or opportunity that does not exist', async () => {
    const router = await createRouter(await createTestDatabase());
    expect((await request(router, '/customers/9999')).status).toBe(404);
    expect(
      (
        await request(router, '/opportunities/9999', {
          method: 'PATCH',
          json: { amount: 1 },
        })
      ).status,
    ).toBe(404);
  });
});
