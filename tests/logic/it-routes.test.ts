import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { Hono, type MiddlewareHandler } from 'hono';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import {
  itAccessToken,
  type ItAccessService,
  type ItRole,
} from '../../server/providers/it-access.js';
import {
  itServiceToken,
  type ItService,
} from '../../server/providers/it-service.js';
import { itApiRoutes } from '../../server/routes/it-operations.js';

/**
 * Route-level security. These tests run the production router factory with a container of test
 * doubles, so the real authentication guard, role guard, and response shaping are exercised rather
 * than a reimplementation of them.
 */

const roles: Record<string, ItRole> = {
  admin: 'administrator',
  engineer: 'engineer',
  employee: 'employee',
};

function createTestAuth() {
  return {
    required: (): MiddlewareHandler<AuthEnv> => async (context, next) => {
      const user = context.req.header('x-test-user');
      if (!user) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }
      context.set('auth', {
        user: { id: user, name: user, email: `${user}@example.com` },
        session: {},
      } as never);
      await next();
    },
  };
}

function createTestAccess(): ItAccessService {
  return {
    roleOf: async (userId: string) => roles[userId] ?? 'employee',
  };
}

function createTestService(): ItService {
  const order = {
    id: 7,
    orderNo: 'WO-1',
    reporterName: 'employee',
    reporterId: 'employee',
    assetId: null,
    assetCode: null,
    assetName: null,
    location: null,
    description: 'broken',
    priority: 'high',
    status: 'pending',
    assignee: null,
    completedAt: null,
    createdAt: null,
    updatedAt: null,
    files: [],
    logs: [],
  };
  return {
    listAssets: async () => [],
    getAsset: async () => {
      throw new Error('unused');
    },
    createAsset: async () => {
      throw new Error('unused');
    },
    updateAsset: async () => {
      throw new Error('unused');
    },
    deleteAsset: async () => undefined,
    listAssignments: async () => [],
    createAssignment: async () => {
      throw new Error('unused');
    },
    returnAssignment: async () => {
      throw new Error('unused');
    },
    listWorkOrders: async () => [order],
    getWorkOrder: async () => order,
    createWorkOrder: async () => order,
    transitionWorkOrder: async (_id, status) => ({ ...order, status }),
    addWorkOrderLog: async () => {
      throw new Error('unused');
    },
    dashboard: async () => ({
      assetsByStatus: {},
      workOrdersByPriority: {},
      completedWorkOrders: 0,
      averageCompletionHours: null,
    }),
  };
}

async function createRouter(): Promise<Hono> {
  const container = new ServiceContainer();
  container.instance(authenticationToken, createTestAuth() as never);
  container.instance(itAccessToken, createTestAccess());
  container.instance(itServiceToken, createTestService());
  const router = await itApiRoutes.createRouter({
    container,
  } as unknown as Application);
  return router as unknown as Hono;
}

function request(
  router: Hono,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return Promise.resolve(router.request(path, init));
}

describe('IT route authorization', () => {
  it('rejects an anonymous request with 401', async () => {
    const router = await createRouter();
    expect((await request(router, '/it/assets')).status).toBe(401);
  });

  it('returns 403 when an employee reads the asset ledger', async () => {
    const router = await createRouter();
    const response = await request(router, '/it/assets', {
      headers: { 'x-test-user': 'employee' },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns 403 when an employee mutates assets', async () => {
    const router = await createRouter();
    const response = await request(router, '/it/assets', {
      method: 'POST',
      headers: {
        'x-test-user': 'employee',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ assetCode: 'X', name: 'Y', category: 'computer' }),
    });
    expect(response.status).toBe(403);
  });

  it('lets an engineer read assets and the dashboard', async () => {
    const router = await createRouter();
    const assets = await request(router, '/it/assets', {
      headers: { 'x-test-user': 'engineer' },
    });
    expect(assets.status).toBe(200);
    const dashboard = await request(router, '/it/dashboard', {
      headers: { 'x-test-user': 'engineer' },
    });
    expect(dashboard.status).toBe(200);
  });

  it('lets an employee list their own work orders', async () => {
    const router = await createRouter();
    const response = await request(router, '/it/work-orders', {
      headers: { 'x-test-user': 'employee' },
    });
    expect(response.status).toBe(200);
  });

  it('hides another reporter’s work order from an employee', async () => {
    const router = await createRouter();
    const response = await request(router, '/it/work-orders/7', {
      headers: { 'x-test-user': 'someone-else' },
    });
    expect(response.status).toBe(403);
  });

  it('lets an engineer advance a work order', async () => {
    const router = await createRouter();
    const response = await request(router, '/it/work-orders/7/transition', {
      method: 'POST',
      headers: {
        'x-test-user': 'engineer',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'in_progress' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { status: 'in_progress' },
    });
  });
});
