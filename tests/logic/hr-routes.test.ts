import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';
import { describe, expect, it } from 'vitest';

import {
  HrError,
  hrServiceToken,
  type HrService,
} from '../../server/providers/hr.js';
import hrRoutes from '../../server/routes/hr.js';

function createTestApp(
  options: {
    onStatistics?: () => Promise<unknown>;
    onCreateLeave?: () => Promise<unknown>;
  } = {},
): {
  request: (path: string, init?: RequestInit) => Promise<Response>;
} {
  const container = new ServiceContainer();

  const required = (): MiddlewareHandler => async (context, next) => {
    const userId = context.req.header('x-test-user');
    if (!userId) return context.json({ error: 'Unauthorized' }, 401);
    (context as unknown as { set: (key: string, value: unknown) => void }).set(
      'auth',
      {
        user: { id: userId, name: userId, email: `${userId}@example.com` },
        session: {},
      },
    );
    await next();
  };

  container.instance(authenticationToken, { required } as never);
  container.instance(databaseManagerToken, {
    query: () => ({}),
  } as never);
  container.instance(serverFileRepositoryManagerToken, {
    repository: () => ({ validateCollection: async () => undefined }),
  } as never);
  // A stand-in drive manager: the route factory resolves the token but only a
  // request that downloads a file would call it.
  // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
  const drive = { use: () => ({}) };
  container.instance(driveManagerToken, drive as never);

  const service = {
    resolveActor: async (userId: string) => ({
      userId,
      name: userId,
      isAdmin: userId === 'admin',
      isHr: false,
      isManager: false,
      isEmployee: true,
      employee: null,
      managedDepartmentIds: [],
    }),
    listEmployees: async (_filter: unknown, actor: { isAdmin: boolean }) => {
      if (!actor.isAdmin) throw new HrError('HR_FORBIDDEN', 403, 'Forbidden');
      return [{ id: 1, name: 'Alice' }];
    },
    listDepartments: async () => [{ id: 1, name: 'Engineering' }],
    statistics: options.onStatistics ?? (async () => ({ month: '2026-09' })),
    createLeaveRequest:
      options.onCreateLeave ??
      (async () => {
        throw new HrError('HR_ANNUAL_LEAVE_EXCEEDED', 400, 'exceeded', {
          remainingAnnualLeaveDays: 1,
        });
      }),
  } as unknown as HrService;

  container.instance(hrServiceToken, service);

  const app = { container } as unknown as Application;

  return {
    async request(path, init) {
      const router = await hrRoutes.createRouter(app);
      return router.request(path, init);
    },
  };
}

describe('HR routes', () => {
  it('rejects anonymous requests with 401', async () => {
    const app = createTestApp();
    const response = await app.request('/hr/employees');
    expect(response.status).toBe(401);
  });

  it('returns 403 when an authenticated employee lacks permission', async () => {
    const app = createTestApp();
    const response = await app.request('/hr/employees', {
      headers: { 'x-test-user': 'employee' },
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('HR_FORBIDDEN');
  });

  it('returns the payload for a permitted caller', async () => {
    const app = createTestApp();
    const response = await app.request('/hr/employees', {
      headers: { 'x-test-user': 'admin' },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  it('maps a domain rule violation to its status and code', async () => {
    const app = createTestApp();
    const response = await app.request('/hr/leave-requests', {
      method: 'POST',
      headers: {
        'x-test-user': 'admin',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ type: 'annual' }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      code?: string;
      remainingAnnualLeaveDays?: number;
    };
    expect(body.code).toBe('HR_ANNUAL_LEAVE_EXCEEDED');
    expect(body.remainingAnnualLeaveDays).toBe(1);
  });

  it('protects statistics and returns data for a permitted caller', async () => {
    const app = createTestApp({
      onStatistics: async () => {
        throw new HrError('HR_FORBIDDEN', 403, 'Forbidden');
      },
    });
    const forbidden = await app.request('/hr/statistics', {
      headers: { 'x-test-user': 'employee' },
    });
    expect(forbidden.status).toBe(403);

    const allowed = createTestApp({
      onStatistics: async () => ({
        month: '2026-09',
        overtimeHoursThisMonth: 5.5,
      }),
    });
    const response = await allowed.request('/hr/statistics', {
      headers: { 'x-test-user': 'admin' },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { overtimeHoursThisMonth: number };
    };
    expect(body.data.overtimeHoursThisMonth).toBe(5.5);
  });
});
