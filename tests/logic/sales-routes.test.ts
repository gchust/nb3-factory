// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { createDatabaseManager, databaseManagerToken } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { Hono } from 'hono';
import { Readable } from 'node:stream';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import createCustomers from '../../database/main/migrations/202609190001_create_sales_customers.js';
import createContacts from '../../database/main/migrations/202609190002_create_sales_contacts.js';
import createOpportunities from '../../database/main/migrations/202609190003_create_sales_opportunities.js';
import createFollowUps from '../../database/main/migrations/202609190004_create_sales_followups.js';
import createFiles from '../../database/main/migrations/202609190005_create_sales_files.js';
import salesApiRoutes from '../../server/routes/sales.js';

const migrations = [
  createCustomers,
  createContacts,
  createOpportunities,
  createFollowUps,
  createFiles,
];

/** Authentication double: the `x-test-user` header is the signed-in user. */
const testAuth = {
  required:
    () =>
    async (
      context: {
        req: { header(name: string): string | undefined };
        set(key: string, value: unknown): void;
        json(body: unknown, status: 400): Response;
      },
      next: () => Promise<void>,
    ) => {
      const userId = context.req.header('x-test-user');
      if (!userId)
        return context.json({ message: 'Authentication required.' }, 401);
      context.set('auth', {
        user: { id: userId, name: userId },
        session: { id: 's' },
      });
      await next();
      return undefined;
    },
};

function authorizationDouble() {
  return {
    permissionSets: {
      getEffective: async ({ principal }: { principal: { id: string } }) => [
        {
          key:
            principal.id === 'manager'
              ? 'system-administrator'
              : 'sales-representative',
          grants: [],
        },
      ],
    },
  };
}

function fileManagerDouble() {
  return {
    repository: () => ({
      validateCollection: async () => undefined,
      uploadOne: async () => ({ record: { id: 'file-1' } }),
      uploadMany: async () => ({ createdCount: 0, records: [] }),
      getUrl: () => '',
      getStorageUrl: async () => '',
      findOne: async () => undefined,
      deleteOne: async () => ({}),
    }),
  };
}

function driveManagerDouble() {
  return {
    // The drive manager's public method is named `use`; this is not a React hook.
    // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
    use: () => ({
      delete: async () => undefined,
      exists: async () => false,
      getStream: async () => Readable.from([]),
    }),
  };
}

describe('sales API routes', () => {
  let database: ReturnType<typeof createDatabaseManager>;
  let router: Hono;
  let container: ServiceContainer;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const connection = database.connection();
    for (const migration of migrations) {
      await migration.up({
        builder: connection.builder,
        query: connection.query,
        connection: connection as never,
      });
    }
    await connection.builder.createCollection('user', (collection) => {
      collection.string('id', { length: 64 }).primary();
      collection.string('name', { length: 255 });
      collection.string('username', { length: 255 });
    });
    const now = new Date();
    await connection.query
      .insertInto('user')
      .values([
        { id: 'rep-a', name: 'Rep A', username: 'rep-a' },
        { id: 'rep-b', name: 'Rep B', username: 'rep-b' },
        { id: 'manager', name: 'Manager', username: 'manager' },
      ])
      .execute();
    await connection.query
      .insertInto('salesCustomers')
      .values([
        {
          id: 'cust-a',
          name: 'Customer A',
          ownerId: 'rep-a',
          importance: 'normal',
          status: 'following',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'cust-b',
          name: 'Customer B',
          ownerId: 'rep-b',
          importance: 'normal',
          status: 'following',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    container = new ServiceContainer();
    container.instance(authenticationToken, testAuth as never);
    container.instance(authorizationToken, authorizationDouble() as never);
    container.instance(databaseManagerToken, database as never);
    container.instance(
      serverFileRepositoryManagerToken,
      fileManagerDouble() as never,
    );
    container.instance(driveManagerToken, driveManagerDouble() as never);

    router = await salesApiRoutes.createRouter({
      container,
      publicBasePath: '/main',
    } as unknown as Application);
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('rejects an anonymous request with 401', async () => {
    const response = await router.request('/sales/customers');
    expect(response.status).toBe(401);
  });

  it('returns only the caller customers for a salesperson', async () => {
    const response = await router.request('/sales/customers', {
      headers: { 'x-test-user': 'rep-a' },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { id: string }[] };
    expect(body.data.map((row) => row.id)).toEqual(['cust-a']);
  });

  it('lets a manager see every customer', async () => {
    const response = await router.request('/sales/customers', {
      headers: { 'x-test-user': 'manager' },
    });
    const body = (await response.json()) as { data: { id: string }[] };
    expect(body.data.map((row) => row.id).sort()).toEqual(['cust-a', 'cust-b']);
  });

  it('hides another salesperson customer behind 404', async () => {
    const response = await router.request('/sales/customers/cust-b', {
      headers: { 'x-test-user': 'rep-a' },
    });
    expect(response.status).toBe(404);
  });

  it('rejects a salesperson reassigning a customer with 403', async () => {
    const response = await router.request('/sales/customers/cust-a', {
      method: 'PATCH',
      headers: { 'x-test-user': 'rep-a', 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId: 'rep-b' }),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('FORBIDDEN');
  });

  it('creates a customer and scopes the follow-up list by owner', async () => {
    const created = await router.request('/sales/customers', {
      method: 'POST',
      headers: { 'x-test-user': 'rep-a', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Fresh Customer' }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: { id: string; ownerId: string };
    };
    expect(createdBody.data.ownerId).toBe('rep-a');

    const followUps = await router.request('/sales/followups', {
      headers: { 'x-test-user': 'rep-b' },
    });
    const followUpBody = (await followUps.json()) as { data: unknown[] };
    expect(followUpBody.data).toEqual([]);
  });

  it('rejects a request body that is not JSON with a validation error', async () => {
    const response = await router.request('/sales/customers', {
      method: 'POST',
      headers: { 'x-test-user': 'rep-a', 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(response.status).toBe(400);
  });
});
