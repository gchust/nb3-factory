// @vitest-environment node
import {
  createAppDatabaseManager,
  resolveDatabaseConfig,
} from '@nocobase/app-server/database';
import { createAppPaths } from '@nocobase/app-server/config';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import type { DatabaseManager } from '@nocobase/db';
import { Hono, type Context, type Next } from 'hono';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { equipmentRoutes } from '../../server/routes/equipment.js';
import {
  createEquipmentService,
  type EquipmentService,
} from '../../server/providers/equipment-service.js';

/**
 * The equipment endpoints over a real database. The authentication plugin is
 * replaced by a header check, because what this file is about is the route
 * layer: that everything is authenticated, that the request reaches the
 * service, and that a business failure comes back as the status code and code
 * the client matches on.
 *
 * The routes are mounted under `/api`, the way the application mounts them.
 */

const root = process.cwd();
const day = 24 * 60 * 60 * 1000;

let database: DatabaseManager;
let service: EquipmentService;
let api: Hono;

/** A stand-in for the authentication plugin: no header means no session. */
const authStub = {
  required: () => async (context: Context, next: Next) => {
    if (!context.req.header('x-test-user')) {
      return context.json({ code: 'UNAUTHENTICATED' }, 401);
    }
    await next();
  },
};

beforeEach(async () => {
  const paths = createAppPaths({
    rootDir: root,
    storageDir: path.join(root, 'storage'),
  });
  const config = await resolveDatabaseConfig({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: ':memory:',
        schemaManagement: 'managed',
      },
    },
  });
  database = createAppDatabaseManager(config, paths);
  await database.connect();
  await database
    .createMigrator({
      directory: path.join(root, 'database/main/migrations'),
      packageName: 'app',
      container: { resolve: () => undefined as never },
    })
    .latest();
  service = createEquipmentService(database);

  const app = {
    container: {
      resolve: (token: unknown) =>
        token === authenticationToken ? authStub : service,
    },
  } as unknown as Application;
  const router = await equipmentRoutes.createRouter(app);
  api = new Hono();
  api.route('/api', router);
});

afterEach(async () => {
  await database.destroy();
});

function call(
  pathName: string,
  init?: RequestInit,
  authenticated = true,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  if (authenticated) {
    headers.set('x-test-user', 'tester');
  }
  return api.request(`http://localhost${pathName}`, {
    ...init,
    headers,
  });
}

describe('equipment routes', () => {
  it('requires a session on every endpoint', async () => {
    await expect(
      call('/api/equipment', undefined, false),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      call('/api/equipment/1', undefined, false),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      call(
        '/api/equipment',
        {
          method: 'POST',
          body: JSON.stringify({ assetNo: 'EQ-1', name: 'X' }),
        },
        false,
      ),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      call('/api/equipment-loans', undefined, false),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      call('/api/equipment-loans/1/return', { method: 'POST' }, false),
    ).resolves.toMatchObject({ status: 401 });
  });

  it('adds, lists, borrows and returns through the API', async () => {
    const created = await call('/api/equipment', {
      method: 'POST',
      body: JSON.stringify({ assetNo: ' EQ-7 ', name: ' Projector ' }),
    });
    expect(created.status).toBe(201);
    const record = (await created.json()) as { id: number; assetNo: string };
    expect(record).toMatchObject({
      assetNo: 'EQ-7',
      name: 'Projector',
      status: 'available',
    });

    const listed = await call('/api/equipment?keyword=eq-7&status=available');
    expect(listed.status).toBe(200);
    const ledger = (await listed.json()) as {
      items: unknown[];
      stats: { total: number; borrowed: number };
    };
    expect(ledger.items).toHaveLength(1);
    expect(ledger.stats).toMatchObject({ total: 1, borrowed: 0 });

    const borrowed = await call(`/api/equipment/${record.id}/borrow`, {
      method: 'POST',
      body: JSON.stringify({
        borrower: ' 李伟 ',
        expectedReturnAt: new Date(Date.now() + day).toISOString(),
      }),
    });
    expect(borrowed.status).toBe(201);
    const loan = (await borrowed.json()) as {
      id: number;
      borrower: string;
      returnedAt: null;
    };
    expect(loan).toMatchObject({ borrower: '李伟', returnedAt: null });

    // A device that is out cannot be borrowed a second time.
    const again = await call(`/api/equipment/${record.id}/borrow`, {
      method: 'POST',
      body: JSON.stringify({
        borrower: '王芳',
        expectedReturnAt: new Date(Date.now() + day).toISOString(),
      }),
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: 'NOT_AVAILABLE' });

    const returned = await call(`/api/equipment-loans/${loan.id}/return`, {
      method: 'POST',
    });
    expect(returned.status).toBe(200);
    expect(await returned.json()).toMatchObject({
      returnedAt: expect.any(String),
    });

    const detail = await call(`/api/equipment/${record.id}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      status: 'available',
      currentBorrower: null,
    });
  });

  it('maps business failures to status codes and codes', async () => {
    const missing = await call('/api/equipment', {
      method: 'POST',
      body: JSON.stringify({ name: 'No number' }),
    });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      code: 'ASSET_NO_REQUIRED',
      field: 'assetNo',
    });

    const duplicate = await call('/api/equipment', {
      method: 'POST',
      body: JSON.stringify({ assetNo: 'EQ-1', name: 'Laptop' }),
    });
    expect(duplicate.status).toBe(201);
    const conflict = await call('/api/equipment', {
      method: 'POST',
      body: JSON.stringify({ assetNo: 'EQ-1', name: 'Other' }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: 'ASSET_NO_TAKEN' });

    const notFound = await call('/api/equipment/9999');
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toMatchObject({
      code: 'EQUIPMENT_NOT_FOUND',
    });

    const missingLoan = await call('/api/equipment-loans/9999/return', {
      method: 'POST',
    });
    expect(missingLoan.status).toBe(404);
    expect(await missingLoan.json()).toMatchObject({ code: 'LOAN_NOT_FOUND' });
  });

  it('lists loans and filters by return state', async () => {
    const created = await call('/api/equipment', {
      method: 'POST',
      body: JSON.stringify({ assetNo: 'EQ-1', name: 'Laptop' }),
    });
    const record = (await created.json()) as { id: number };
    const borrowed = await call(`/api/equipment/${record.id}/borrow`, {
      method: 'POST',
      body: JSON.stringify({
        borrower: '张敏',
        expectedReturnAt: new Date(Date.now() - day).toISOString(),
      }),
    });
    const loan = (await borrowed.json()) as { id: number };

    const all = await call('/api/equipment-loans?keyword=张');
    expect(all.status).toBe(200);
    expect(await all.json()).toEqual([
      expect.objectContaining({
        id: loan.id,
        borrower: '张敏',
        overdue: true,
        returnedAt: null,
      }),
    ]);

    await call(`/api/equipment-loans/${loan.id}/return`, { method: 'POST' });

    const active = await call('/api/equipment-loans?status=active');
    expect(await active.json()).toEqual([]);
    const returned = await call('/api/equipment-loans?status=returned');
    expect(await returned.json()).toHaveLength(1);
  });
});
