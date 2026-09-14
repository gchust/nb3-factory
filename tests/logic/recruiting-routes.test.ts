import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import type { Context, Hono, Next } from 'hono';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

type TestContext = Context<{ Variables: Record<string, unknown> }>;

import { apiRoutes } from '../../server/routes/recruiting.js';
import { recruitingServiceToken } from '../../server/providers/recruiting-service.js';

interface Options {
  authenticated?: boolean;
  authorized?: boolean;
}

async function createTestRouter(options: Options): Promise<Hono> {
  const authenticated = options.authenticated ?? true;
  const authorized = options.authorized ?? true;
  const container = new ServiceContainer();

  container.instance(authenticationToken, {
    required: () => async (context: TestContext, next: Next) => {
      if (!authenticated) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }
      context.set('auth', { user: { id: 'user-1' } });
      await next();
    },
  } as never);

  container.instance(authorizationToken, {
    middleware: () => async (context: TestContext, next: Next) => {
      context.set('authz', {
        identity: { principal: { type: 'user', id: 'user-1' } },
        authorize: async () =>
          authorized
            ? {
                effect: 'conditional',
                reasons: [],
                conditions: {
                  type: 'database',
                  collection: 'main.recruitingRequisitions',
                  action: 'read',
                  filter: { $and: [] },
                  fields: { input: '*', output: '*' },
                },
              }
            : { effect: 'deny', reasons: [] },
      });
      await next();
    },
  } as never);

  container.instance(recruitingServiceToken, {
    listRequisitions: async () => [
      {
        id: 1,
        title: 'Backend engineer',
        department: 'Engineering',
        headcount: 2,
        priority: 'high',
        status: 'open',
      },
    ],
    requisitionOptions: async () => [],
    getRequisition: async () => undefined,
    createRequisition: async () => 1,
    updateRequisition: async () => 0,
    deleteRequisition: async () => 0,
  } as never);

  const app = { container } as unknown as Application;
  return apiRoutes.createRouter(app) as unknown as Promise<Hono>;
}

describe('recruiting routes', () => {
  it('rejects an anonymous request with 401', async () => {
    const router = await createTestRouter({ authenticated: false });
    const response = await router.request('/recruiting/requisitions');
    expect(response.status).toBe(401);
  });

  it('rejects an authenticated but unauthorized request with 403', async () => {
    const router = await createTestRouter({ authorized: false });
    const response = await router.request('/recruiting/requisitions');
    expect(response.status).toBe(403);
  });

  it('returns the permitted payload for an authorized request', async () => {
    const router = await createTestRouter({ authorized: true });
    const response = await router.request('/recruiting/requisitions');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });
});
