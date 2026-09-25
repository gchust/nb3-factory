// @vitest-environment node
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type MigrationContext,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/20250925000001_create_customer_memos.js';
import {
  createCustomerMemoService,
  customerMemoServiceToken,
  type CustomerMemo,
} from '../../server/providers/index.js';
import { customerMemoRoutes } from '../../server/routes/customer-memos.js';

const AUTH_HEADER = { authorization: 'Bearer test-token' } as const;

/**
 * A stand-in for the authentication service: it gates on the `Authorization`
 * header and otherwise passes the request through, so the route's own wiring to
 * `auth.required()` is exercised without standing up Better Auth and its
 * session storage.
 */
function createTestAuth(): Auth {
  const required: MiddlewareHandler = async (context, next) => {
    if (context.req.header('authorization') !== 'Bearer test-token') {
      return context.json(
        { code: 'UNAUTHORIZED', message: 'Authentication required' },
        401,
      );
    }
    await next();
  };

  return { required: () => required } as unknown as Auth;
}

function createManager(): DatabaseManager {
  return createDatabaseManager({
    default: 'main',
    metadataStore: new InMemoryCollectionMetadataStore(),
    drivers: { sqlite: sqlite.driver },
    connections: {
      main: sqlite({
        filename: ':memory:',
        schemaManagement: 'managed',
        pool: { min: 1, max: 1 },
      }),
    },
  });
}

async function migrationContext(
  manager: DatabaseManager,
): Promise<MigrationContext> {
  const connection = await manager.connect('main');
  return {
    builder: connection.builder,
    query: connection.query,
    repository: connection.repository,
    connection,
    config: { get: () => undefined },
    container: new ServiceContainer(),
  } as unknown as MigrationContext;
}

let manager: DatabaseManager;
let router: ReturnType<typeof customerMemoRoutes.createRouter>;

beforeEach(async () => {
  manager = createManager();
  await migration.up(await migrationContext(manager));

  const container = new ServiceContainer();
  container.instance(authenticationToken, createTestAuth());
  container.instance(
    customerMemoServiceToken,
    createCustomerMemoService(manager),
  );

  // The route factory only reaches `app.container`; the rest of `Application`
  // is irrelevant to the contribution under test.
  router = await customerMemoRoutes.createRouter({
    container,
  } as unknown as Application);
});

afterEach(async () => {
  await manager.destroy();
});

function request(
  path: string,
  init: RequestInit = {},
): ReturnType<typeof router.request> {
  return router.request(path, init);
}

function authenticated(path: string, init: RequestInit = {}) {
  return request(path, {
    ...init,
    headers: { ...AUTH_HEADER, ...(init.headers ?? {}) },
  });
}

async function createMemo(
  customerName: string,
  remark?: string | null,
): Promise<CustomerMemo> {
  const response = await authenticated('http://localhost/customer-memos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customerName, remark }),
  });
  expect(response.status).toBe(201);
  return (await response.json()).data as CustomerMemo;
}

describe('customer memo routes', () => {
  it('rejects an anonymous request with 401 and answers an authenticated one', async () => {
    const anonymous = await request('http://localhost/customer-memos');
    expect(anonymous.status).toBe(401);
    await expect(anonymous.json()).resolves.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    const authenticatedResponse = await authenticated(
      'http://localhost/customer-memos',
    );
    expect(authenticatedResponse.status).toBe(200);
    await expect(authenticatedResponse.json()).resolves.toEqual({ data: [] });
  });

  it('creates, reads, updates and deletes a memo', async () => {
    const created = await createMemo('Acme Trading Co.', 'First note');
    expect(created).toMatchObject({
      customerName: 'Acme Trading Co.',
      remark: 'First note',
    });
    expect(typeof created.id).toBe('number');
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);

    const detail = await authenticated(
      `http://localhost/customer-memos/${created.id}`,
    );
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toEqual({ data: created });

    const patched = await authenticated(
      `http://localhost/customer-memos/${created.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerName: 'Acme Trading Limited' }),
      },
    );
    expect(patched.status).toBe(200);
    await expect(patched.json()).resolves.toMatchObject({
      data: { id: created.id, customerName: 'Acme Trading Limited' },
    });

    const deleted = await authenticated(
      `http://localhost/customer-memos/${created.id}`,
      { method: 'DELETE' },
    );
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toEqual({ data: { deleted: true } });

    // The record is gone: a second read and a second delete both report 404.
    const missing = await authenticated(
      `http://localhost/customer-memos/${created.id}`,
    );
    expect(missing.status).toBe(404);
    const deletedAgain = await authenticated(
      `http://localhost/customer-memos/${created.id}`,
      { method: 'DELETE' },
    );
    expect(deletedAgain.status).toBe(404);
  });

  it('refuses an empty customer name and an over-long remark with 422', async () => {
    const emptyName = await authenticated('http://localhost/customer-memos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customerName: '   ' }),
    });
    expect(emptyName.status).toBe(422);
    await expect(emptyName.json()).resolves.toMatchObject({
      code: 'CUSTOMER_NAME_REQUIRED',
    });

    const created = await createMemo('Globex Manufacturing');

    const blankedName = await authenticated(
      `http://localhost/customer-memos/${created.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerName: '' }),
      },
    );
    expect(blankedName.status).toBe(422);
    await expect(blankedName.json()).resolves.toMatchObject({
      code: 'CUSTOMER_NAME_REQUIRED',
    });

    const longRemark = await authenticated('http://localhost/customer-memos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Long Remark Co.',
        remark: 'x'.repeat(2001),
      }),
    });
    expect(longRemark.status).toBe(422);
    await expect(longRemark.json()).resolves.toMatchObject({
      code: 'INVALID_REMARK',
    });
  });

  it('treats a blank remark as absent', async () => {
    const created = await createMemo('Whitespace Co.', '   ');
    expect(created.remark).toBeNull();
  });

  it('filters by a partial customer name and clears back to the full list', async () => {
    await createMemo('Acme Trading Co.');
    await createMemo('Northwind Logistics');
    await createMemo('Globex Manufacturing');

    const all = await authenticated('http://localhost/customer-memos');
    const allBody = (await all.json()) as { data: CustomerMemo[] };
    expect(allBody).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ customerName: 'Acme Trading Co.' }),
        expect.objectContaining({ customerName: 'Northwind Logistics' }),
        expect.objectContaining({ customerName: 'Globex Manufacturing' }),
      ]),
    });
    expect(allBody.data).toHaveLength(3);

    const partial = await authenticated(
      'http://localhost/customer-memos?search=trading',
    );
    const partialBody = (await partial.json()) as { data: CustomerMemo[] };
    expect(partialBody.data).toHaveLength(1);
    expect(partialBody.data[0]?.customerName).toBe('Acme Trading Co.');

    // An empty search value is the same as no filter: the full list comes back.
    const cleared = await authenticated(
      'http://localhost/customer-memos?search=',
    );
    expect(
      ((await cleared.json()) as { data: CustomerMemo[] }).data,
    ).toHaveLength(3);
  });
});
