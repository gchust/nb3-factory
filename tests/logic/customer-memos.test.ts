// @vitest-environment node
import type { Auth } from '@nocobase/app-plugin-authentication';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  createDatabaseManager,
  type DatabaseManager,
  type DatabaseTaskConfig,
  type Migrator,
  type SeedContext,
} from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Context, Next } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import customerMemoSeed from '../../database/main/seeds/202609280002_seed_customer_memos.js';
import {
  createCustomerMemoService,
  customerMemoServiceToken,
  CustomerMemoNotFoundError,
  CustomerMemoValidationError,
  type CustomerMemoService,
} from '../../server/providers/customer-memos.js';
import { customerMemoApiRoutes } from '../../server/routes/customer-memos.js';

const applicationRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const migrationsDirectory = path.join(
  applicationRoot,
  'database',
  'main',
  'migrations',
);
const MIGRATION_NAME = '202609280001_create_customer_memos';
const TOKEN = 'test-token';

interface TestContext {
  readonly manager: DatabaseManager;
  readonly migrator: Migrator;
  readonly service: CustomerMemoService;
  readonly router: Awaited<
    ReturnType<typeof customerMemoApiRoutes.createRouter>
  >;
}

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

/** A signed-in or anonymous session, without standing up the whole authentication plugin. */
function createFakeAuth(): Auth {
  return {
    required:
      () =>
      async (context: Context, next: Next): Promise<Response | void> => {
        if (context.req.header('authorization') !== `Bearer ${TOKEN}`) {
          return context.json({ code: 'UNAUTHENTICATED' }, 401);
        }
        await next();
      },
  } as unknown as Auth;
}

/** A real sqlite database with the migration applied, its Repository wired into the service, and the route mounted over it. */
async function createTestContext(): Promise<TestContext> {
  const directory = mkdtempSync(path.join(tmpdir(), 'customer-memos-'));
  const manager = createDatabaseManager({
    default: 'main',
    connections: {
      main: sqlite({
        filename: path.join(directory, 'test.sqlite'),
        schemaManagement: 'managed',
      }),
    },
  });
  cleanups.push(async () => {
    await manager.destroy();
    rmSync(directory, { recursive: true, force: true });
  });

  await manager.connect('main');
  const migrator = manager.createMigrator({
    directory: migrationsDirectory,
    packageName: 'app',
  });
  await migrator.latest();

  const service = createCustomerMemoService(manager);
  const container = new ServiceContainer();
  container.instance(customerMemoServiceToken, service);
  container.instance(authenticationToken, createFakeAuth());
  const router = await customerMemoApiRoutes.createRouter({
    container,
  } as unknown as Application);

  return { manager, migrator, service, router };
}

function seedContext(manager: DatabaseManager): SeedContext {
  const connection = manager.connection('main');
  return {
    config: {} as DatabaseTaskConfig,
    container: new ServiceContainer(),
    repository: (collection: string) => manager.repository(collection),
    query: connection.query,
    connection,
  } as unknown as SeedContext;
}

function authorized(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${TOKEN}` },
  };
}

describe('customer memo service', () => {
  it('applies and rolls back the migration against a real database', async () => {
    const { manager, migrator, service } = await createTestContext();

    expect(
      await manager.collections('main').get('customerMemos'),
    ).toBeDefined();
    expect((await migrator.history()).map((entry) => entry.name)).toContain(
      MIGRATION_NAME,
    );

    await migrator.rollback();

    // The table is gone, so the Collection is unresolved and a read fails.
    expect(
      await manager.collections('main').get('customerMemos'),
    ).toBeUndefined();
    await expect(service.list()).rejects.toBeTruthy();
  });

  it('creates, reads, updates and deletes a memo', async () => {
    const { service } = await createTestContext();

    const created = await service.create({
      name: '  Luna Cycles  ',
      note: '  Likes the blue frame  ',
    });
    expect(created.name).toBe('Luna Cycles');
    expect(created.note).toBe('Likes the blue frame');
    expect(Number.isInteger(created.id)).toBe(true);
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);

    expect(await service.get(created.id)).toEqual(created);

    const updated = await service.update(created.id, {
      name: 'Luna Cycles Ltd',
      note: '   ',
    });
    expect(updated.name).toBe('Luna Cycles Ltd');
    // An empty optional note is stored as null, not as an empty string.
    expect(updated.note).toBeNull();

    await service.remove(created.id);
    await expect(service.get(created.id)).rejects.toBeInstanceOf(
      CustomerMemoNotFoundError,
    );
  });

  it('rejects a blank name and reports a missing record', async () => {
    const { service } = await createTestContext();

    const failure = await service
      .create({ name: '   ', note: 'nobody' })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CustomerMemoValidationError);
    expect((failure as CustomerMemoValidationError).field).toBe('name');
    expect((failure as CustomerMemoValidationError).code).toBe('NAME_REQUIRED');

    await expect(
      service.update(9999, { name: 'Nobody' }),
    ).rejects.toBeInstanceOf(CustomerMemoNotFoundError);
    await expect(service.remove(9999)).rejects.toBeInstanceOf(
      CustomerMemoNotFoundError,
    );
  });

  it('searches a partial customer name and restores the full list when cleared', async () => {
    const { service } = await createTestContext();

    await service.create({ name: 'Northwind Traders' });
    await service.create({ name: 'Blue Harbor Cafe' });
    await service.create({ name: 'Acme Robotics' });

    const partial = await service.list('harbor');
    expect(partial.map((memo) => memo.name)).toEqual(['Blue Harbor Cafe']);

    // When the search is cleared, every record comes back.
    const all = await service.list();
    expect(all.map((memo) => memo.name).sort()).toEqual([
      'Acme Robotics',
      'Blue Harbor Cafe',
      'Northwind Traders',
    ]);
  });
});

describe('customer memo seed', () => {
  it('inserts the sample memos once and leaves them alone on a second run', async () => {
    const { manager, service } = await createTestContext();
    const context = seedContext(manager);

    await customerMemoSeed.run(context);
    const first = await service.list();
    expect(first).toHaveLength(3);

    // Running the seed again must not duplicate or overwrite anything.
    await customerMemoSeed.run(context);
    const second = await service.list();
    expect(second).toHaveLength(3);
    expect(second.map((memo) => memo.name).sort()).toEqual(
      first.map((memo) => memo.name).sort(),
    );
  });
});

describe('customer memo routes', () => {
  it('refuses anonymous requests', async () => {
    const { router } = await createTestContext();

    const list = await router.request('/customer-memos');
    expect(list.status).toBe(401);
    const create = await router.request('/customer-memos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Anonymous' }),
    });
    expect(create.status).toBe(401);
  });

  it('lists, creates, reads, updates and deletes over HTTP', async () => {
    const { router } = await createTestContext();

    const empty = await router.request('/customer-memos', authorized());
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ data: [] });

    const created = await router.request('/customer-memos', {
      ...authorized({ method: 'POST' }),
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Soylent Corp', note: 'Renewal next week' }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: { id: number; name: string; note: string | null };
    };
    expect(createdBody.data.name).toBe('Soylent Corp');
    expect(createdBody.data.note).toBe('Renewal next week');

    const fetched = await router.request(
      `/customer-memos/${createdBody.data.id}`,
      authorized(),
    );
    expect(fetched.status).toBe(200);

    const updated = await router.request(
      `/customer-memos/${createdBody.data.id}`,
      {
        ...authorized({ method: 'PATCH' }),
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Soylent Corporation', note: '' }),
      },
    );
    expect(updated.status).toBe(200);
    expect(
      (
        (await updated.json()) as {
          data: { name: string; note: string | null };
        }
      ).data,
    ).toMatchObject({ name: 'Soylent Corporation', note: null });

    const deleted = await router.request(
      `/customer-memos/${createdBody.data.id}`,
      authorized({ method: 'DELETE' }),
    );
    expect(deleted.status).toBe(204);

    const missing = await router.request(
      `/customer-memos/${createdBody.data.id}`,
      authorized(),
    );
    expect(missing.status).toBe(404);
  });

  it('answers a blank name with a field error and a malformed id with a bad request', async () => {
    const { router } = await createTestContext();

    const blank = await router.request('/customer-memos', {
      ...authorized({ method: 'POST' }),
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: '   ' }),
    });
    expect(blank.status).toBe(400);
    expect(await blank.json()).toMatchObject({
      code: 'NAME_REQUIRED',
      field: 'name',
    });

    const badId = await router.request('/customer-memos/not-a-number', {
      ...authorized(),
    });
    expect(badId.status).toBe(400);
    expect(await badId.json()).toEqual({ code: 'INVALID_ID' });
  });

  it('filters by a partial customer name through the search parameter', async () => {
    const { service, router } = await createTestContext();
    await service.create({ name: 'Northwind Traders' });
    await service.create({ name: 'Blue Harbor Cafe' });

    const filtered = await router.request(
      '/customer-memos?search=harbor',
      authorized(),
    );
    expect(filtered.status).toBe(200);
    const body = (await filtered.json()) as { data: { name: string }[] };
    expect(body.data.map((memo) => memo.name)).toEqual(['Blue Harbor Cafe']);

    const all = await router.request('/customer-memos', authorized());
    const allBody = (await all.json()) as { data: unknown[] };
    expect(allBody.data).toHaveLength(2);
  });
});
