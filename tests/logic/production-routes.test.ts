import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';

import { productionApiRoutes } from '../../server/routes/production.js';
import { productionServiceToken } from '../../server/providers/production-provider.js';
import { ProductionService } from '../../server/providers/production-service.js';
import { createTestDatabase, type TestDatabase } from './production-test-db.js';

const ROLE_BY_USER: Record<string, string[]> = {
  supervisor: ['production-supervisor'],
  'leader-a': ['team-leader'],
  'leader-b': ['team-leader'],
  inspector: ['quality-inspector'],
};

type JsonResponse = {
  data?: unknown;
  error?: { code?: string };
};

let database: TestDatabase;
let service: ProductionService;
let router: {
  request: (input: string, init?: RequestInit) => Promise<Response>;
};
let teamA = 0;
let orderA = 0;
let orderB = 0;

function authHeaders(userId: string): Record<string, string> {
  return { 'x-test-user': userId };
}

async function json(response: Response): Promise<JsonResponse> {
  return (await response.json()) as JsonResponse;
}

beforeAll(async () => {
  database = await createTestDatabase();
  service = new ProductionService(database.manager, {
    listRoleKeys: async (userId) => ROLE_BY_USER[userId] ?? [],
  });

  const now = new Date();
  const teamIds: Record<string, number> = {};
  for (const code of ['TEAM-A', 'TEAM-B']) {
    const inserted = await database.connection.query
      .insertInto('teams')
      .values({ code, name: code, createdAt: now, updatedAt: now })
      .execute();
    teamIds[code] = Number(inserted.insertId);
  }
  teamA = teamIds['TEAM-A'];

  for (const [userId, teamId] of [
    ['leader-a', teamIds['TEAM-A']],
    ['leader-b', teamIds['TEAM-B']],
  ] as const) {
    await database.connection.query
      .insertInto('staffProfiles')
      .values({
        userId,
        role: 'team-leader',
        teamId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  const product = await service.createProduct({
    code: 'P-ROUTE',
    name: 'Route product',
    unit: '件',
    standardMinutes: 12.5,
  });
  const supervisor = {
    userId: 'supervisor',
    name: 'Supervisor',
    roles: ['production-supervisor'],
    teamId: null,
    teamName: null,
  };
  orderA = (
    await service.createWorkOrder(
      {
        code: 'WO-ROUTE-A',
        productId: product.id,
        teamId: teamIds['TEAM-A'],
        plannedQuantity: 100,
        processes: [{ name: '下料', plannedQuantity: 100 }],
      },
      supervisor,
    )
  ).id;
  orderB = (
    await service.createWorkOrder(
      {
        code: 'WO-ROUTE-B',
        productId: product.id,
        teamId: teamIds['TEAM-B'],
        plannedQuantity: 100,
        processes: [{ name: '贴片', plannedQuantity: 100 }],
      },
      supervisor,
    )
  ).id;

  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => async (context, next) => {
      const userId = context.req.header('x-test-user');
      if (!userId) return context.json({ code: 'UNAUTHORIZED' }, 401);
      context.set('auth', {
        user: { id: userId, name: userId, email: `${userId}@example.com` },
      });
      await next();
    },
    optional: () => async (_context, next) => {
      await next();
    },
  } as never);
  container.instance(productionServiceToken, service);
  container.instance(userAdministrationServiceToken, {
    withConnection: () => ({
      create: async () => ({ id: 'registered-user' }),
    }),
  } as never);
  const permissionSets = {
    get: async () => undefined,
    create: async (input: unknown) => input,
    assign: async (input: unknown) => input,
    withConnection: () => permissionSets,
  };
  container.instance(authorizationToken, { permissionSets } as never);
  container.instance(databaseManagerToken, database.manager);

  const app = { container } as unknown as Application;
  router = await productionApiRoutes.createRouter(app);
}, 30_000);

afterAll(async () => {
  await database.manager.destroy();
});

describe('production routes', () => {
  it('rejects an anonymous request', async () => {
    const response = await router.request('/production/work-orders');
    expect(response.status).toBe(401);
  });

  it('reports the signed-in actor capabilities', async () => {
    const response = await router.request('/production/me', {
      headers: authHeaders('leader-a'),
    });
    expect(response.status).toBe(200);
    const payload = await json(response);
    const data = payload.data as {
      roles: string[];
      capabilities: { canReport: boolean; canManageWorkOrders: boolean };
    };
    expect(data.roles).toContain('team-leader');
    expect(data.capabilities.canReport).toBe(true);
    expect(data.capabilities.canManageWorkOrders).toBe(false);
  });

  it('refuses to let a team leader create a work order', async () => {
    const response = await router.request('/production/work-orders', {
      body: JSON.stringify({
        productId: 1,
        teamId: teamA,
        plannedQuantity: 10,
        processes: [{ name: 'X', plannedQuantity: 10 }],
      }),
      headers: {
        ...authHeaders('leader-a'),
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    expect(response.status).toBe(403);
    expect((await json(response)).error?.code).toBe('FORBIDDEN');
  });

  it('lets a supervisor create a work order', async () => {
    const response = await router.request('/production/work-orders', {
      body: JSON.stringify({
        productId: 1,
        teamId: teamA,
        plannedQuantity: 10,
        processes: [
          { name: 'First', plannedQuantity: 10 },
          { name: 'Second', plannedQuantity: 10 },
        ],
      }),
      headers: {
        ...authHeaders('supervisor'),
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    expect(response.status).toBe(201);
    expect((await json(response)).data).toMatchObject({
      code: expect.any(String),
    });
  });

  it('scopes the work order list to the team leader team', async () => {
    const response = await router.request('/production/work-orders', {
      headers: authHeaders('leader-a'),
    });
    const rows = (await json(response)).data as {
      code: string;
      teamId: number;
    }[];
    expect(rows.map((row) => row.code)).toContain('WO-ROUTE-A');
    expect(rows.map((row) => row.code)).not.toContain('WO-ROUTE-B');
    expect(rows.every((row) => row.teamId === teamA)).toBe(true);
  });

  it('denies opening another team work order directly', async () => {
    const response = await router.request(`/production/work-orders/${orderB}`, {
      headers: authHeaders('leader-a'),
    });
    expect(response.status).toBe(403);
    expect((await json(response)).error?.code).toBe('FORBIDDEN');
  });

  it('allows the own team work order detail and report', async () => {
    const detailResponse = await router.request(
      `/production/work-orders/${orderA}`,
      { headers: authHeaders('leader-a') },
    );
    expect(detailResponse.status).toBe(200);
    const detail = (await json(detailResponse)).data as {
      processes: { id: number }[];
    };

    const reportResponse = await router.request(
      `/production/work-orders/${orderA}/reports`,
      {
        body: JSON.stringify({
          processId: detail.processes[0].id,
          quantity: 5,
          qualifiedQuantity: 5,
          defectQuantity: 0,
        }),
        headers: {
          ...authHeaders('leader-a'),
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
    expect(reportResponse.status).toBe(201);
  });

  it('does not let an inspector submit a work report', async () => {
    const response = await router.request(
      `/production/work-orders/${orderA}/reports`,
      {
        body: JSON.stringify({
          processId: 1,
          quantity: 1,
          qualifiedQuantity: 1,
          defectQuantity: 0,
        }),
        headers: {
          ...authHeaders('inspector'),
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
    expect(response.status).toBe(403);
  });

  it('lets an inspector read defect records', async () => {
    const response = await router.request('/production/defects', {
      headers: authHeaders('inspector'),
    });
    expect(response.status).toBe(200);
  });

  it('refuses to self-register the administrator role', async () => {
    const response = await router.request('/staff/register', {
      body: JSON.stringify({
        name: 'Bad',
        username: 'bad',
        email: 'bad@example.com',
        password: 'password123',
        role: 'system-administrator',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(403);
    expect((await json(response)).error?.code).toBe('ROLE_NOT_ASSIGNABLE');
  });

  it('requires a team for a self-registered team leader', async () => {
    const response = await router.request('/staff/register', {
      body: JSON.stringify({
        name: 'Leader',
        username: 'newleader',
        email: 'newleader@example.com',
        password: 'password123',
        role: 'team-leader',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(400);
    expect((await json(response)).error?.code).toBe('TEAM_REQUIRED');
  });

  it('registers a team leader and stores the profile', async () => {
    const response = await router.request('/staff/register', {
      body: JSON.stringify({
        name: 'Leader',
        username: 'newleader',
        email: 'newleader@example.com',
        password: 'password123',
        role: 'team-leader',
        teamId: teamA,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(201);
    const profile = await database.connection.query
      .selectFrom('staffProfiles')
      .selectAll()
      .where('userId', '=', 'registered-user')
      .executeTakeFirst();
    expect(profile).toMatchObject({ role: 'team-leader', teamId: teamA });
  });
});
