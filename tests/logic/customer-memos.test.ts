// @vitest-environment node
import {
  createDatabaseManager,
  databaseManagerToken,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { customerMemoApiRoutes } from '../../server/routes/customer-memos.js';

const root = path.resolve(import.meta.dirname, '../..');
const migrationsDirectory = path.join(root, 'database/main/migrations');
const seedsDirectory = path.join(root, 'database/main/seeds');
const PACKAGE_NAME = 'customer-memos-test';

interface CustomerMemoRecord {
  id: number;
  customerName: string;
  note: string | null;
  createdAt: string;
}

interface Fixture {
  readonly manager: DatabaseManager;
  readonly close: () => Promise<void>;
}

const fixtures: Fixture[] = [];

/** A disposable SQLite database with the application's migrations applied. */
async function createFixture(
  options: { readonly seed?: boolean } = {},
): Promise<Fixture> {
  const directory = mkdtempSync(path.join(tmpdir(), 'customer-memos-'));
  const manager = createDatabaseManager({
    drivers: { sqlite },
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'database.sqlite'),
        schemaManagement: 'managed',
        metadataStore: new InMemoryCollectionMetadataStore(),
      },
    },
  } as never);

  await manager
    .createMigrator({
      directory: migrationsDirectory,
      packageName: PACKAGE_NAME,
    })
    .latest();
  if (options.seed) {
    await manager
      .createSeeder({ directory: seedsDirectory, packageName: PACKAGE_NAME })
      .run();
  }

  const fixture: Fixture = {
    manager,
    async close() {
      await manager.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
  fixtures.push(fixture);
  return fixture;
}

function memos(fixture: Fixture): Repository<CustomerMemoRecord> {
  return fixture.manager.repository<CustomerMemoRecord>('customerMemos');
}

afterEach(async () => {
  while (fixtures.length > 0) {
    await fixtures.pop()?.close();
  }
});

async function createRouteApp(
  fixture: Fixture,
  authenticated: boolean,
): Promise<import('hono').Hono> {
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, fixture.manager);
  container.instance(authenticationToken, {
    // The real authentication provider is covered by the application test
    // suite; this exercises the route's own wiring and behavior.
    required: () => async (context: never, next: () => Promise<void>) => {
      if (authenticated) {
        return next();
      }
      return (
        context as { json: (body: unknown, status: number) => Response }
      ).json({ code: 'UNAUTHENTICATED' }, 401);
    },
  } as never);
  return customerMemoApiRoutes.createRouter({
    container,
  } as unknown as Application);
}

describe('customer memo migration', () => {
  it('creates a table that stores and reads memos', async () => {
    const fixture = await createFixture();
    const repository = memos(fixture);

    const created = await repository.createOne({
      values: {
        customerName: '测试客户',
        note: '第一条备注',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    });

    expect(created.record.id).toBeGreaterThan(0);
    const found = await repository.findOne({
      filter: { id: created.record.id },
    });
    expect(found).toMatchObject({
      customerName: '测试客户',
      note: '第一条备注',
    });
  });

  it('rolls the schema back in down()', async () => {
    const fixture = await createFixture();
    await memos(fixture).createOne({
      values: {
        customerName: '待回滚客户',
        note: null,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    });

    const result = await fixture.manager
      .createMigrator({
        directory: migrationsDirectory,
        packageName: PACKAGE_NAME,
      })
      .rollback();

    expect(result.rolledBack).toContain('202609270001_create_customer_memos');
    // The collection is gone, so the repository can no longer resolve it.
    await expect(memos(fixture).findMany()).rejects.toMatchObject({
      code: 'COLLECTION_NOT_FOUND',
    });
  });
});

describe('customer memo seed', () => {
  it('inserts three samples and stays idempotent', async () => {
    const fixture = await createFixture();
    const repository = memos(fixture);

    // A memo that already exists under a sample's name must be left alone.
    await repository.createOne({
      values: {
        customerName: '星河智能科技有限公司',
        note: '人工修改的备注',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });

    await fixture.manager
      .createSeeder({ directory: seedsDirectory, packageName: PACKAGE_NAME })
      .run();
    const firstRun = await repository.findMany({
      sort: (sort) => sort.field('customerName').asc(),
    });
    expect(firstRun).toHaveLength(3);
    expect(new Set(firstRun.map((memo) => memo.customerName))).toEqual(
      new Set([
        '星河智能科技有限公司',
        '青禾食品有限公司',
        '远山物流股份有限公司',
      ]),
    );
    const preserved = firstRun.find(
      (memo) => memo.customerName === '星河智能科技有限公司',
    );
    expect(preserved?.note).toBe('人工修改的备注');

    // A second run executes nothing and adds nothing.
    const seeder = fixture.manager.createSeeder({
      directory: seedsDirectory,
      packageName: PACKAGE_NAME,
    });
    const rerun = await seeder.run();
    expect(rerun.executed).toHaveLength(0);
    expect(await repository.count()).toBe(3);
  });
});

describe('customer memo search', () => {
  it('matches a partial name and restores the full list when cleared', async () => {
    const fixture = await createFixture({ seed: true });
    const repository = memos(fixture);

    const partial = await repository.findMany({
      filter: (filter) =>
        filter.string('customerName').includes('青禾', { mode: 'insensitive' }),
    });
    expect(partial).toHaveLength(1);
    expect(partial[0]?.customerName).toBe('青禾食品有限公司');

    const latin = await repository.findMany({
      filter: (filter) =>
        filter
          .string('customerName')
          .includes('company', { mode: 'insensitive' }),
    });
    expect(latin).toHaveLength(0);

    const all = await repository.findMany();
    expect(all).toHaveLength(3);
  });
});

describe('customer memo API', () => {
  it('rejects anonymous requests', async () => {
    const fixture = await createFixture();
    const app = await createRouteApp(fixture, false);
    for (const [method, url] of [
      ['GET', '/customer-memos'],
      ['POST', '/customer-memos'],
      ['GET', '/customer-memos/1'],
      ['PATCH', '/customer-memos/1'],
      ['DELETE', '/customer-memos/1'],
    ] as const) {
      const response = await app.request(url, { method });
      expect(response.status, `${method} ${url}`).toBe(401);
    }
  });

  it('refuses a memo without a customer name', async () => {
    const fixture = await createFixture();
    const app = await createRouteApp(fixture, true);
    const response = await app.request('/customer-memos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customerName: '   ' }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CUSTOMER_MEMO_NAME_REQUIRED',
    });
    expect(await memos(fixture).count()).toBe(0);
  });

  it('creates, lists, searches, updates and deletes a memo', async () => {
    const fixture = await createFixture();
    const app = await createRouteApp(fixture, true);

    const createResponse = await app.request('/customer-memos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customerName: ' 新客户 ', note: ' 初次接触 ' }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      data: CustomerMemoRecord;
    };
    expect(created.data.customerName).toBe('新客户');
    expect(created.data.note).toBe('初次接触');
    expect(created.data.createdAt).toBeTruthy();

    const list = (await (await app.request('/customer-memos')).json()) as {
      data: CustomerMemoRecord[];
    };
    expect(list.data).toHaveLength(1);

    const search = (await (
      await app.request('/customer-memos?search=新客')
    ).json()) as { data: CustomerMemoRecord[] };
    expect(search.data).toHaveLength(1);

    const emptySearch = (await (
      await app.request('/customer-memos?search=不存在')
    ).json()) as { data: CustomerMemoRecord[] };
    expect(emptySearch.data).toHaveLength(0);

    const updateResponse = await app.request(
      `/customer-memos/${created.data.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerName: '新客户（已更新）', note: null }),
      },
    );
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()) as {
      data: CustomerMemoRecord;
    };
    expect(updated.data.customerName).toBe('新客户（已更新）');
    expect(updated.data.note).toBeNull();

    const deleteResponse = await app.request(
      `/customer-memos/${created.data.id}`,
      { method: 'DELETE' },
    );
    expect(deleteResponse.status).toBe(204);
    expect(await memos(fixture).count()).toBe(0);

    const missing = await app.request(`/customer-memos/${created.data.id}`, {
      method: 'DELETE',
    });
    expect(missing.status).toBe(404);

    const missingGet = await app.request('/customer-memos/999999');
    expect(missingGet.status).toBe(404);
  });
});
