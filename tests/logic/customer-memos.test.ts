// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type MigrationContext,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { Hono, type Context, type Next } from 'hono';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609210001_create_customer_memos.ts';
import seed from '../../database/main/seeds/202609210002_seed_customer_memos.ts';
import {
  CustomerMemoValidationError,
  createCustomerMemoService,
  customerMemoServiceToken,
  type CustomerMemoService,
} from '../../server/providers/customer-memos.ts';
import { customerMemoRoutes } from '../../server/routes/customer-memos.ts';

const databases: DatabaseManager[] = [];

interface TestDatabase {
  readonly context: MigrationContext;
  readonly database: DatabaseManager;
}

/**
 * A real in-memory SQLite database with the customer memo migration applied.
 * The tests exercise the actual migration, queries, and constraints rather
 * than a mocked query layer.
 */
async function setup(): Promise<TestDatabase> {
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: sqlite({ filename: ':memory:', schemaManagement: 'managed' }),
    },
    metadataStore: new InMemoryCollectionMetadataStore(),
  });
  databases.push(database);

  await database.connect('main');

  const context: MigrationContext = {
    builder: database.builder('main'),
    query: database.query('main'),
    connection: database.connection(
      'main',
    ) as unknown as MigrationContext['connection'],
  };

  await migration.up(context);
  return { context, database };
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
});

describe('customer memo migration', () => {
  it('creates the declared columns, enforces required fields, and reverses with down', async () => {
    const { context, database } = await setup();
    const client = await database.connection('main').client<Knex>();

    const columns = (await client.raw('PRAGMA table_info(customer_memos)')) as {
      name: string;
      notnull: number;
    }[];
    const byName = Object.fromEntries(
      columns.map((column) => [column.name, column]),
    );

    expect(Object.keys(byName).sort()).toEqual([
      'created_at',
      'customer_name',
      'id',
      'note',
    ]);
    expect(byName.customer_name!.notnull).toBe(1);
    expect(byName.note!.notnull).toBe(0);
    expect(byName.created_at!.notnull).toBe(1);

    const indexes = (await client.raw('PRAGMA index_list(customer_memos)')) as {
      name: string;
    }[];
    const indexedColumns: string[] = [];
    for (const index of indexes) {
      const info = (await client.raw(`PRAGMA index_info(${index.name})`)) as {
        name: string;
      }[];
      indexedColumns.push(...info.map((column) => column.name));
    }
    expect(indexedColumns).toContain('customer_name');

    await expect(
      client.raw(
        'insert into customer_memos (customer_name, note, created_at) values (?, ?, ?)',
        [null, null, new Date().toISOString()],
      ),
    ).rejects.toBeDefined();

    await migration.down!(context);
    await expect(
      database.query('main').selectFrom('customerMemos').selectAll().execute(),
    ).rejects.toBeDefined();
  });
});

describe('customer memo seed', () => {
  it('inserts the examples once and leaves user edits untouched on a repeat run', async () => {
    const { context, database } = await setup();
    const query = database.query('main');

    await seed.run({ query, connection: context.connection });
    let rows = await query.selectFrom('customerMemos').selectAll().execute();
    expect(rows).toHaveLength(2);

    await query
      .updateTable('customerMemos')
      .set({ note: 'edited by a user' })
      .where('customerName', '=', '北山贸易有限公司')
      .execute();

    await seed.run({ query, connection: context.connection });
    rows = await query.selectFrom('customerMemos').selectAll().execute();
    expect(rows).toHaveLength(2);

    const edited = rows.find((row) => row.customerName === '北山贸易有限公司');
    expect(edited?.note).toBe('edited by a user');
  });
});

describe('customer memo service', () => {
  it('creates, lists, searches, updates, and removes memos', async () => {
    const { database } = await setup();
    const service = createCustomerMemoService(database);

    const first = await service.create({
      customerName: '  Acme  ',
      note: '  hello  ',
    });
    expect(first.customerName).toBe('Acme');
    expect(first.note).toBe('hello');
    expect(first.id).toBeGreaterThan(0);
    expect(Number.isNaN(new Date(first.createdAt).getTime())).toBe(false);

    const second = await service.create({ customerName: 'Bravo', note: null });

    const listed = await service.list();
    expect(listed.map((memo) => memo.customerName)).toEqual(['Bravo', 'Acme']);
    expect(listed[0]!.note).toBeNull();

    expect(
      (await service.list('acm')).map((memo) => memo.customerName),
    ).toEqual(['Acme']);
    expect(
      (await service.list('Bra')).map((memo) => memo.customerName),
    ).toEqual(['Bravo']);
    expect(await service.list('nothing-matches')).toEqual([]);
    expect(await service.list('   ')).toHaveLength(2);

    const updated = await service.update(second.id, {
      customerName: 'Bravo Ltd',
      note: 'updated',
    });
    expect(updated).toMatchObject({
      customerName: 'Bravo Ltd',
      id: second.id,
      note: 'updated',
    });
    expect(
      await service.update(99999, { customerName: 'Ghost', note: null }),
    ).toBeUndefined();

    expect(await service.remove(first.id)).toBe(true);
    expect(await service.remove(first.id)).toBe(false);
    expect((await service.list()).map((memo) => memo.customerName)).toEqual([
      'Bravo Ltd',
    ]);
  });

  it('rejects a memo without a customer name', async () => {
    const { database } = await setup();
    const service = createCustomerMemoService(database);

    await expect(
      service.create({ customerName: '   ', note: null }),
    ).rejects.toBeInstanceOf(CustomerMemoValidationError);
    await expect(
      service.create({ customerName: '', note: 'no name' }),
    ).rejects.toBeInstanceOf(CustomerMemoValidationError);
  });
});

describe('customer memo routes', () => {
  it('rejects anonymous requests', async () => {
    const { database } = await setup();
    const http = await createTestRouter(createCustomerMemoService(database));

    const response = await http.request('/api/customer-memos');
    expect(response.status).toBe(401);
  });

  it('serves create, list, search, update, and delete', async () => {
    const { database } = await setup();
    const http = await createTestRouter(createCustomerMemoService(database));
    const headers = {
      authorization: 'Bearer test',
      'content-type': 'application/json',
    };

    const createResponse = await http.request('/api/customer-memos', {
      body: JSON.stringify({ customerName: 'Acme', note: 'hello' }),
      headers,
      method: 'POST',
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      data: { id: number; customerName: string; note: string | null };
    };
    expect(created.data.customerName).toBe('Acme');

    const listResponse = await http.request('/api/customer-memos', { headers });
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      data: { customerName: string }[];
    };
    expect(listed.data.map((memo) => memo.customerName)).toEqual(['Acme']);

    const searchResponse = await http.request('/api/customer-memos?search=ac', {
      headers,
    });
    const searched = (await searchResponse.json()) as {
      data: { customerName: string }[];
    };
    expect(searched.data.map((memo) => memo.customerName)).toEqual(['Acme']);

    const emptySearch = await http.request('/api/customer-memos?search=zzz', {
      headers,
    });
    expect(
      ((await emptySearch.json()) as { data: unknown[] }).data,
    ).toHaveLength(0);

    const patchResponse = await http.request(
      `/api/customer-memos/${created.data.id}`,
      {
        body: JSON.stringify({ customerName: 'Acme Ltd', note: null }),
        headers,
        method: 'PATCH',
      },
    );
    expect(patchResponse.status).toBe(200);
    const patched = (await patchResponse.json()) as {
      data: { customerName: string; note: string | null };
    };
    expect(patched.data.customerName).toBe('Acme Ltd');
    expect(patched.data.note).toBeNull();

    const deleteResponse = await http.request(
      `/api/customer-memos/${created.data.id}`,
      { headers, method: 'DELETE' },
    );
    expect(deleteResponse.status).toBe(204);

    const afterDelete = await http.request('/api/customer-memos', { headers });
    expect(
      ((await afterDelete.json()) as { data: unknown[] }).data,
    ).toHaveLength(0);
  });

  it('rejects blank names and invalid payloads', async () => {
    const { database } = await setup();
    const http = await createTestRouter(createCustomerMemoService(database));
    const headers = {
      authorization: 'Bearer test',
      'content-type': 'application/json',
    };

    const blank = await http.request('/api/customer-memos', {
      body: JSON.stringify({ customerName: '   ', note: null }),
      headers,
      method: 'POST',
    });
    expect(blank.status).toBe(400);
    expect(((await blank.json()) as { code: string }).code).toBe(
      'CUSTOMER_NAME_REQUIRED',
    );

    const missingName = await http.request('/api/customer-memos', {
      body: JSON.stringify({ note: 'no name' }),
      headers,
      method: 'POST',
    });
    expect(missingName.status).toBe(400);

    const invalidJson = await http.request('/api/customer-memos', {
      body: 'not json',
      headers,
      method: 'POST',
    });
    expect(invalidJson.status).toBe(400);
  });

  it('returns 404 for missing records and 400 for invalid ids', async () => {
    const { database } = await setup();
    const http = await createTestRouter(createCustomerMemoService(database));
    const headers = {
      authorization: 'Bearer test',
      'content-type': 'application/json',
    };

    const patchMissing = await http.request('/api/customer-memos/99999', {
      body: JSON.stringify({ customerName: 'Ghost', note: null }),
      headers,
      method: 'PATCH',
    });
    expect(patchMissing.status).toBe(404);

    const deleteMissing = await http.request('/api/customer-memos/99999', {
      headers,
      method: 'DELETE',
    });
    expect(deleteMissing.status).toBe(404);

    const invalidId = await http.request('/api/customer-memos/abc', {
      headers,
      method: 'DELETE',
    });
    expect(invalidId.status).toBe(400);
  });
});

/**
 * Mounts the real route contribution behind a minimal fake authentication
 * middleware, so the tests cover the route's own wiring and HTTP behavior.
 */
async function createTestRouter(service: CustomerMemoService): Promise<Hono> {
  const auth = {
    required:
      () =>
      async (context: Context, next: Next): Promise<Response | void> => {
        if (context.req.header('authorization') !== 'Bearer test') {
          return context.json({ code: 'UNAUTHENTICATED' }, 401);
        }

        await next();
      },
  };

  const app = {
    container: {
      resolve: (token: unknown) => {
        if (token === authenticationToken) {
          return auth;
        }
        if (token === customerMemoServiceToken) {
          return service;
        }
        throw new Error('Unexpected service token.');
      },
    },
  } as unknown as Application;

  const router = await customerMemoRoutes.createRouter(app);
  const http = new Hono();
  http.route('/api', router);
  return http;
}
