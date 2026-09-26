// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Context } from 'hono';

import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';

import type { DatabaseManager } from '@nocobase/db';

import {
  createEquipmentService,
  equipmentServiceToken,
  type EquipmentService,
} from '../../server/providers/equipment';
import { equipmentApiRoutes } from '../../server/routes/equipment';
import { borrowRecordApiRoutes } from '../../server/routes/borrow-records';
import { applyMigrations, createTestDatabase } from './equipment-support';

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTH_HEADER = { 'x-test-user': 'tester' };

/**
 * A double for the authentication service the routes depend on. It stands in
 * for the real plugin only in the narrow sense the routes use it: an
 * `authentication.required()` middleware that answers 401 without a signed-in
 * caller. The routes are exercised through their real factory, so their own
 * middleware wiring and error mapping are what is under test.
 */
function createTestAuthentication(): Auth {
  return {
    required:
      () =>
      async (
        context: Context,
        next: () => Promise<void>,
      ): Promise<Response | void> => {
        if (context.req.header('x-test-user') === undefined) {
          return context.json(
            { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
            401,
          );
        }
        await next();
      },
  } as unknown as Auth;
}

/**
 * The routes are called through the contribution's own `createRouter`, with a
 * container holding the real service over a real database — the same
 * composition the application uses, minus the plugins a test does not need.
 */
describe('equipment HTTP routes', () => {
  let database: DatabaseManager | undefined;
  let service: EquipmentService;
  let equipmentRouter: Awaited<
    ReturnType<typeof equipmentApiRoutes.createRouter>
  >;
  let borrowRouter: Awaited<
    ReturnType<typeof borrowRecordApiRoutes.createRouter>
  >;

  beforeEach(async () => {
    database = createTestDatabase();
    await applyMigrations(database);
    service = createEquipmentService({ database });

    const container = new ServiceContainer();
    container.instance(authenticationToken, createTestAuthentication());
    container.instance(equipmentServiceToken, service);
    const app = { container } as unknown as Application;

    equipmentRouter = await equipmentApiRoutes.createRouter(app);
    borrowRouter = await borrowRecordApiRoutes.createRouter(app);
  });

  afterEach(async () => {
    await database?.destroy();
    database = undefined;
  });

  function request(
    input: string,
    init: RequestInit = {},
    authenticated = true,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (authenticated) {
      headers.set('x-test-user', AUTH_HEADER['x-test-user']);
    }
    return equipmentRouter.request(input, { ...init, headers });
  }

  function borrowRequest(
    input: string,
    init: RequestInit = {},
    authenticated = true,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (authenticated) {
      headers.set('x-test-user', AUTH_HEADER['x-test-user']);
    }
    return borrowRouter.request(input, { ...init, headers });
  }

  async function createEquipment(
    body: Record<string, unknown>,
  ): Promise<Response> {
    return request('/equipment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  describe('authentication', () => {
    it('refuses an anonymous caller on every path', async () => {
      for (const path of ['/equipment', '/equipment/1']) {
        const response = await request(path, {}, false);
        expect(response.status).toBe(401);
      }
      for (const path of ['/borrow-records', '/borrow-records/1/return']) {
        const response = await borrowRequest(
          path,
          { method: path.endsWith('return') ? 'POST' : 'GET' },
          false,
        );
        expect(response.status).toBe(401);
      }
    });
  });

  describe('equipment ledger', () => {
    it('lists the ledger for a signed-in caller', async () => {
      await createEquipment({ assetCode: 'EQ-1', name: '设备一' });

      const response = await request('/equipment');

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: unknown[];
      };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        assetCode: 'EQ-1',
        status: 'available',
      });
    });

    it('creates a device with 201 and the created resource', async () => {
      const response = await createEquipment({
        assetCode: 'EQ-2',
        name: '设备二',
        category: '电脑设备',
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as { data: { id: number } };
      expect(body.data.id).toBeGreaterThan(0);
    });

    it('rejects an incomplete device with 422', async () => {
      const response = await createEquipment({ assetCode: 'EQ-3' });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('rejects a duplicate asset code with 409', async () => {
      await createEquipment({ assetCode: 'EQ-4', name: '设备四' });

      const response = await createEquipment({
        assetCode: 'EQ-4',
        name: '另一台',
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: 'ASSET_CODE_TAKEN',
      });
    });

    it('rejects malformed JSON with 422 rather than a server fault', async () => {
      const response = await request('/equipment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('reports a missing device as 404', async () => {
      await expect(
        request('/equipment/9999').then((r) => r.status),
      ).resolves.toBe(404);
      await expect(
        request('/equipment/abc').then((r) => r.status),
      ).resolves.toBe(404);
    });

    it('updates a device through PATCH', async () => {
      const created = await createEquipment({
        assetCode: 'EQ-5',
        name: '旧名称',
      });
      const { data } = (await created.json()) as { data: { id: number } };

      const response = await request(`/equipment/${data.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetCode: 'EQ-5', name: '新名称' }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        data: { name: '新名称' },
      });
    });
  });

  describe('borrow records', () => {
    async function borrowEquipment(
      body: Record<string, unknown>,
    ): Promise<{ status: number; id: number; code?: string }> {
      const response = await borrowRequest('/borrow-records', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        data?: { id: number };
        code?: string;
      };
      return {
        status: response.status,
        id: payload.data?.id ?? 0,
        code: payload.code,
      };
    }

    it('borrows a device and lists the record', async () => {
      const created = await createEquipment({
        assetCode: 'EQ-6',
        name: '设备六',
      });
      const { data } = (await created.json()) as { data: { id: number } };

      const borrow = await borrowEquipment({
        equipmentId: data.id,
        borrower: '李四',
        expectedReturnAt: new Date(Date.now() + DAY_MS).toISOString(),
      });
      expect(borrow.status).toBe(201);
      expect(borrow.id).toBeGreaterThan(0);

      const response = await borrowRequest('/borrow-records');
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: unknown[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        borrower: '李四',
        status: 'borrowed',
      });
    });

    it('rejects a borrow without an expected return date', async () => {
      const created = await createEquipment({
        assetCode: 'EQ-7',
        name: '设备七',
      });
      const { data } = (await created.json()) as { data: { id: number } };

      const response = await borrowEquipment({
        equipmentId: data.id,
        borrower: '李四',
      });

      expect(response.status).toBe(422);
      expect(response.code).toBe('VALIDATION_ERROR');
    });

    it('refuses to borrow a device that is already out', async () => {
      const created = await createEquipment({
        assetCode: 'EQ-8',
        name: '设备八',
      });
      const { data } = (await created.json()) as { data: { id: number } };
      const expectedReturnAt = new Date(Date.now() + DAY_MS).toISOString();

      await borrowEquipment({
        equipmentId: data.id,
        borrower: '李四',
        expectedReturnAt,
      });
      const second = await borrowEquipment({
        equipmentId: data.id,
        borrower: '王五',
        expectedReturnAt,
      });

      expect(second.status).toBe(409);
    });

    it('records a return idempotently and reports an unknown record', async () => {
      const created = await createEquipment({
        assetCode: 'EQ-9',
        name: '设备九',
      });
      const { data } = (await created.json()) as { data: { id: number } };
      const borrow = await borrowEquipment({
        equipmentId: data.id,
        borrower: '李四',
        expectedReturnAt: new Date(Date.now() + DAY_MS).toISOString(),
      });

      const first = await borrowRequest(`/borrow-records/${borrow.id}/return`, {
        method: 'POST',
      });
      const second = await borrowRequest(
        `/borrow-records/${borrow.id}/return`,
        {
          method: 'POST',
        },
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const firstBody = (await first.json()) as {
        data: { id: number; status: string; returnedAt: string };
      };
      const secondBody = (await second.json()) as {
        data: { returnedAt: string };
      };
      expect(firstBody.data).toMatchObject({
        id: borrow.id,
        status: 'returned',
      });
      expect(secondBody.data.returnedAt).toBe(firstBody.data.returnedAt);

      const missing = await borrowRequest('/borrow-records/9999/return', {
        method: 'POST',
      });
      expect(missing.status).toBe(404);
      await expect(missing.json()).resolves.toMatchObject({
        code: 'LOAN_NOT_FOUND',
      });
    });
  });

  describe('error handling', () => {
    it('does not turn an unexpected failure into a client error', async () => {
      const container = new ServiceContainer();
      container.instance(authenticationToken, createTestAuthentication());
      container.instance(equipmentServiceToken, {
        listEquipment: () => Promise.reject(new Error('database exploded')),
      } as unknown as EquipmentService);
      const router = await equipmentApiRoutes.createRouter({
        container,
      } as unknown as Application);

      const response = await router.request('/equipment', {
        headers: AUTH_HEADER,
      });

      expect(response.status).toBe(500);
    });
  });
});
