import { createAuthentication } from '@nocobase/app-plugin-authentication';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { DatabaseAssetService } from '../server/providers/asset-service.js';
import {
  createAssetRouter,
  type AssetAuthorizationScope,
  type AssetRouterEnv,
} from '../server/routes/assets.js';
import { createTestDatabase } from './helpers/asset-test-db.js';

const RESOURCES = {
  assets: 'main.itAssets',
  records: 'main.itAssetRecords',
  employees: 'main.itEmployees',
};

function permitScope(): AssetAuthorizationScope {
  return {
    async authorize() {
      // The real authorization middleware returns a conditional decision with
      // an all-records filter even when the grant allows every record.
      return {
        effect: 'conditional',
        conditions: { filter: { $and: [] } },
      };
    },
  };
}

function denyScope(): AssetAuthorizationScope {
  return {
    async authorize() {
      return { effect: 'deny' };
    },
  };
}

function buildApp(
  scope: AssetAuthorizationScope,
  service: DatabaseAssetService,
) {
  const app = new Hono<AssetRouterEnv>();
  app.use('*', async (context, next) => {
    context.set('authz', scope);
    await next();
  });
  app.route('/', createAssetRouter({ assets: service, resources: RESOURCES }));
  return app;
}

describe('asset routes', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const auth = createAuthentication({
        connection: database.connection(),
        secret: 'test-secret-0123456789-0123456789',
      });
      const app = new Hono();
      app.use('/assets', auth.required());
      app.get('/assets', (context) => context.json({ ok: true }));
      const response = await app.request('/assets');
      expect(response.status).toBe(401);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe('UNAUTHORIZED');
    } finally {
      await database.destroy();
    }
  });

  it('rejects denied requests with 403 on every action', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const app = buildApp(denyScope(), service);
      const requests: Array<[string, string, BodyInit?]> = [
        ['GET', '/assets'],
        ['GET', '/assets/1'],
        ['POST', '/assets'],
        ['PUT', '/assets/1'],
        ['DELETE', '/assets/1'],
        ['POST', '/assets/1/claim'],
        ['POST', '/assets/1/return'],
        ['GET', '/assets/records'],
        ['GET', '/assets/employees'],
      ];
      for (const [method, path, body] of requests) {
        const response = await app.request(path, {
          method,
          body,
          headers: body ? { 'content-type': 'application/json' } : undefined,
        });
        expect(response.status, `${method} ${path}`).toBe(403);
      }
    } finally {
      await database.destroy();
    }
  });

  it('lists assets for a permitted request', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const app = buildApp(permitScope(), service);
      const response = await app.request('/assets?type=computer');
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: Array<{ assetNumber: string }>;
      };
      expect(body.data).toHaveLength(3);
      expect(body.data[0].assetNumber).toBe('ASSET-006');
    } finally {
      await database.destroy();
    }
  });

  it('creates an asset with 201', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const app = buildApp(permitScope(), service);
      const response = await app.request('/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetNumber: 'ASSET-099',
          name: '测试显示器',
          type: 'monitor',
          brandModel: '某品牌 27 寸',
          status: 'available',
        }),
      });
      expect(response.status).toBe(201);
      const body = (await response.json()) as { data: { assetNumber: string } };
      expect(body.data.assetNumber).toBe('ASSET-099');
    } finally {
      await database.destroy();
    }
  });

  it('rejects invalid create input with 400', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const app = buildApp(permitScope(), service);
      const response = await app.request('/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetNumber: '',
          name: '',
          type: 'not-a-type',
          brandModel: '',
          status: 'available',
        }),
      });
      expect(response.status).toBe(400);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe('BAD_REQUEST');
    } finally {
      await database.destroy();
    }
  });

  it('returns 404 for a missing asset', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const app = buildApp(permitScope(), service);
      const response = await app.request('/assets/9999');
      expect(response.status).toBe(404);
    } finally {
      await database.destroy();
    }
  });

  it('returns 409 when claiming an in-use asset', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const app = buildApp(permitScope(), service);
      const response = await app.request('/assets/2/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId: 1 }),
      });
      expect(response.status).toBe(409);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe('CONFLICT');
    } finally {
      await database.destroy();
    }
  });

  it('claims and returns an asset end to end', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const app = buildApp(permitScope(), service);

      const claim = await app.request('/assets/1/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId: 6, remark: '领用' }),
      });
      expect(claim.status).toBe(200);
      const claimed = (await claim.json()) as {
        data: { status: string; currentEmployeeName: string | null };
      };
      expect(claimed.data.status).toBe('inUse');
      expect(claimed.data.currentEmployeeName).toBe('赵磊');

      const returned = await app.request('/assets/1/return', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ remark: '归还' }),
      });
      expect(returned.status).toBe(200);
      const returnedBody = (await returned.json()) as {
        data: { status: string; currentEmployeeId: number | null };
      };
      expect(returnedBody.data.status).toBe('available');
      expect(returnedBody.data.currentEmployeeId).toBeNull();
    } finally {
      await database.destroy();
    }
  });

  it('lists records filtered by asset', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const app = buildApp(permitScope(), service);
      const response = await app.request('/assets/records?assetId=2');
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: Array<{ assetNumber: string; status: string }>;
      };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].assetNumber).toBe('ASSET-002');
      expect(body.data[0].status).toBe('claimed');
    } finally {
      await database.destroy();
    }
  });

  it('lists employees', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const app = buildApp(permitScope(), service);
      const response = await app.request('/assets/employees');
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: Array<{ name: string; isAdmin: boolean }>;
      };
      expect(body.data).toHaveLength(6);
      const admin = body.data.find((row) => row.isAdmin);
      expect(admin?.name).toBe('张伟');
    } finally {
      await database.destroy();
    }
  });
});
