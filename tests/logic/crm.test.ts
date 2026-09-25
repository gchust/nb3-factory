// @vitest-environment node

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
  type MigrationContext,
  type SeedContext,
} from '@nocobase/db';
import { sqlite, sqliteDriver } from '@nocobase/db-sqlite';
import { Hono } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import crmSeed from '../../database/main/seeds/202609100002_seed_crm_data.js';
import crmMigration from '../../database/main/migrations/202609100001_create_crm_tables.js';
import { crmApiRoutes } from '../../server/routes/crm.js';
import {
  CrmDuplicateError,
  CrmNotFoundError,
  CrmService,
  CrmValidationError,
} from '../../server/providers/crm-service.js';

const SEEDED_CUSTOMER_TOTAL = 566000;
const SEEDED_OTHER_CUSTOMER_TOTAL = 210000;

const databases: { readonly manager: DatabaseManager; readonly dir: string }[] =
  [];

afterEach(async () => {
  for (const database of databases.splice(0)) {
    await database.manager.destroy();
    rmSync(database.dir, { recursive: true, force: true });
  }
});

describe('crm migration and seed', () => {
  it('creates the three tables and drops them in reverse order', async () => {
    const database = await createDatabase();

    await migrateUp(database);
    await expect(database.repository('customers').findMany()).resolves.toEqual(
      [],
    );
    await expect(database.repository('contacts').findMany()).resolves.toEqual(
      [],
    );
    await expect(
      database.repository('opportunities').findMany(),
    ).resolves.toEqual([]);

    await migrateDown(database);
    await expect(database.repository('customers').findMany()).rejects.toThrow();
  });

  it('seeds required demo data idempotently', async () => {
    const database = await createDatabase();
    await migrateUp(database);

    await runSeed(database);
    await runSeed(database);

    const customers = await database.repository('customers').findMany();
    const contacts = await database.repository('contacts').findMany();
    const opportunities = await database.repository('opportunities').findMany();

    expect(customers).toHaveLength(2);
    expect(contacts).toHaveLength(3);
    expect(opportunities).toHaveLength(3);
    expect(customers.map((row) => row.name).sort()).toEqual(
      ['蓝海贸易', '阿尔法制造'].sort(),
    );
  });

  it('computes a customer total from the real opportunity records', async () => {
    const database = await createDatabase();
    await migrateUp(database);
    await runSeed(database);

    const service = new CrmService(database);
    const customers = await service.listCustomers();
    const alpha = customers.find((row) => row.name === '阿尔法制造');
    const blue = customers.find((row) => row.name === '蓝海贸易');

    expect(alpha).toMatchObject({
      contactCount: 2,
      opportunityCount: 2,
      totalAmount: SEEDED_CUSTOMER_TOTAL,
    });
    expect(blue).toMatchObject({
      contactCount: 1,
      opportunityCount: 1,
      totalAmount: SEEDED_OTHER_CUSTOMER_TOTAL,
    });

    const detail = await service.getCustomer(alpha!.id);
    expect(detail.contacts).toHaveLength(2);
    expect(detail.opportunities).toHaveLength(2);
    expect(detail.totalAmount).toBe(SEEDED_CUSTOMER_TOTAL);
    expect(
      detail.contacts.every((row) => row.customerName === '阿尔法制造'),
    ).toBe(true);
  });

  it('filters opportunities by stage', async () => {
    const database = await createDatabase();
    await migrateUp(database);
    await runSeed(database);

    const service = new CrmService(database);
    const won = await service.listOpportunities('won');
    const all = await service.listOpportunities();

    expect(all).toHaveLength(3);
    expect(won).toHaveLength(1);
    expect(won[0]).toMatchObject({ name: '备件采购', stage: 'won' });
  });
});

describe('crm service validation', () => {
  it('rejects a missing name, a bad amount and an unknown customer', async () => {
    const database = await createDatabase();
    await migrateUp(database);
    await runSeed(database);
    const service = new CrmService(database);

    await expect(service.createCustomer({})).rejects.toBeInstanceOf(
      CrmValidationError,
    );
    await expect(
      service.createCustomer({ name: '   ' }),
    ).rejects.toBeInstanceOf(CrmValidationError);
    await expect(
      service.createOpportunity({ name: 'x', customerId: 1, amount: -1 }),
    ).rejects.toBeInstanceOf(CrmValidationError);
    await expect(
      service.createOpportunity({ name: 'x', customerId: 9999, amount: 1 }),
    ).rejects.toBeInstanceOf(CrmValidationError);
    await expect(
      service.createContact({ name: 'x', customerId: 9999 }),
    ).rejects.toBeInstanceOf(CrmValidationError);
  });

  it('rejects duplicate business names and unknown updates', async () => {
    const database = await createDatabase();
    await migrateUp(database);
    await runSeed(database);
    const service = new CrmService(database);

    await expect(
      service.createCustomer({ name: '阿尔法制造' }),
    ).rejects.toBeInstanceOf(CrmDuplicateError);

    const alpha = (await service.listCustomers()).find(
      (row) => row.name === '阿尔法制造',
    )!;
    await expect(
      service.createContact({ name: '张伟', customerId: alpha.id }),
    ).rejects.toBeInstanceOf(CrmDuplicateError);

    await expect(
      service.updateCustomer(9999, { name: 'Nowhere' }),
    ).rejects.toBeInstanceOf(CrmNotFoundError);
  });
});

describe('crm api routes', () => {
  it('requires a session on every owned path', async () => {
    const database = await createDatabase();
    await migrateUp(database);
    await runSeed(database);

    const router = await createRouter(database, {
      authenticated: false,
    });

    for (const request of [
      new Request('http://localhost/customers'),
      new Request('http://localhost/customers', { method: 'POST' }),
      new Request('http://localhost/customers/1'),
      new Request('http://localhost/contacts'),
      new Request('http://localhost/opportunities'),
      new Request('http://localhost/opportunities/1', { method: 'PATCH' }),
    ]) {
      const response = await router.fetch(request);
      expect(response.status).toBe(401);
    }
  });

  it('serves and validates records for an authenticated caller', async () => {
    const database = await createDatabase();
    await migrateUp(database);
    await runSeed(database);

    const router = await createRouter(database, { authenticated: true });

    const list = await router.fetch(new Request('http://localhost/customers'));
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      data: { name: string; totalAmount: number }[];
    };
    expect(listBody.data).toHaveLength(2);

    const filtered = await router.fetch(
      new Request('http://localhost/opportunities?stage=won'),
    );
    const filteredBody = (await filtered.json()) as {
      data: { name: string; stage: string }[];
    };
    expect(filteredBody.data).toEqual([
      expect.objectContaining({ name: '备件采购', stage: 'won' }),
    ]);

    const detail = await router.fetch(
      new Request('http://localhost/customers/1'),
    );
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      data: { contacts: unknown[]; opportunities: unknown[] };
    };
    expect(detailBody.data.contacts).toHaveLength(2);
    expect(detailBody.data.opportunities).toHaveLength(2);

    const invalid = await router.fetch(
      new Request('http://localhost/customers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      }),
    );
    expect(invalid.status).toBe(422);

    const duplicate = await router.fetch(
      new Request('http://localhost/customers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '阿尔法制造' }),
      }),
    );
    expect(duplicate.status).toBe(409);
    const duplicateBody = (await duplicate.json()) as { code: string };
    expect(duplicateBody.code).toBe('DUPLICATE_NAME');

    const missing = await router.fetch(
      new Request('http://localhost/customers/9999', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Nowhere' }),
      }),
    );
    expect(missing.status).toBe(404);

    const created = await router.fetch(
      new Request('http://localhost/opportunities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: '新增商机',
          customerId: 1,
          amount: 100,
          stage: 'following',
        }),
      }),
    );
    expect(created.status).toBe(201);
  });
});

async function createDatabase(): Promise<DatabaseManager> {
  const dir = mkdtempSync(path.join(tmpdir(), 'crm-test-'));
  const manager = createDatabaseManager({
    default: 'main',
    connections: {
      main: sqlite({ filename: path.join(dir, 'database.sqlite') }),
    },
    drivers: { sqlite: sqliteDriver },
  });
  await manager.connect();
  databases.push({ manager, dir });
  return manager;
}

function migrationContext(database: DatabaseManager): MigrationContext {
  return {
    builder: database.builder(),
    config: {} as never,
    container: {} as never,
    query: database.query(),
    repository: ((collection: string) =>
      database.repository(collection)) as never,
    connection: {} as never,
  };
}

async function migrateUp(database: DatabaseManager): Promise<void> {
  await crmMigration.up(migrationContext(database));
}

async function migrateDown(database: DatabaseManager): Promise<void> {
  await crmMigration.down?.(migrationContext(database));
}

async function runSeed(database: DatabaseManager): Promise<void> {
  const context: SeedContext = {
    config: {} as never,
    container: {} as never,
    repository: ((collection: string) =>
      database.repository(collection)) as never,
    query: database.query(),
    connection: {} as never,
  };
  await crmSeed.run(context);
}

async function createRouter(
  database: DatabaseManager,
  { authenticated }: { readonly authenticated: boolean },
): Promise<Hono> {
  const auth = {
    required:
      () =>
      async (
        context: {
          json: (body: unknown, status: 401) => Response;
        },
        next: () => Promise<void>,
      ): Promise<Response | void> => {
        if (authenticated) {
          await next();
          return;
        }
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      },
  };
  const app = {
    container: {
      resolve: (token: unknown) => {
        if (token === databaseManagerToken) return database;
        if (token === authenticationToken) return auth;
        throw new Error(`Unexpected token: ${String(token)}`);
      },
    },
  } as unknown as Application;

  return (await crmApiRoutes.createRouter(app)) as unknown as Hono;
}
