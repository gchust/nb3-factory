import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Context, Next } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { deliveryApiRoutes } from '../../server/routes/delivery.js';
import {
  deliveryServiceToken,
  type DeliveryActor,
  type DeliveryService,
} from '../../server/providers/delivery-service.js';

const dashboardData = {
  projectCount: 4,
  milestoneCount: 10,
  milestonesCompleted: 4,
  milestoneCompletionRate: 0.4,
  taskCount: 24,
  tasksCompleted: 9,
  overdueTaskCount: 3,
  pendingReviewCount: 2,
  myOpenTaskCount: 0,
  overdueTasks: [],
  myTasks: [],
  pendingReviews: [],
};

function createHarness(): {
  readonly router: Awaited<ReturnType<typeof deliveryApiRoutes.createRouter>>;
  readonly dashboard: ReturnType<typeof vi.fn>;
} {
  const container = new ServiceContainer();
  const dashboard = vi.fn(async (actor: DeliveryActor) => ({
    ...dashboardData,
    projectCount: actor.isAdmin ? 4 : 0,
  }));
  const service = {
    resolveActor: async (userId: string): Promise<DeliveryActor> => ({
      userId,
      isAdmin: userId === 'admin',
    }),
    dashboard,
  } as unknown as DeliveryService;

  container.instance(authenticationToken, {
    required: () => async (context: Context<AuthEnv>, next: Next) => {
      const userId = context.req.header('x-test-user');
      if (!userId) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }
      context.set('auth', {
        user: { id: userId },
        session: { expiresAt: new Date() },
      });
      await next();
    },
  });
  container.instance(deliveryServiceToken, service);

  return {
    router: deliveryApiRoutes.createRouter({
      container,
    } as unknown as Application),
    dashboard,
  };
}

describe('delivery API routes', () => {
  it('refuses anonymous requests', async () => {
    const { router } = createHarness();
    const resolved = await router;
    const response = await resolved.request('/delivery/dashboard');
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('serves the dashboard to a signed-in caller and passes the resolved actor', async () => {
    const { router, dashboard } = createHarness();
    const resolved = await router;
    const response = await resolved.request('/delivery/dashboard', {
      headers: { 'x-test-user': 'admin' },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: dashboardData });
    expect(dashboard).toHaveBeenCalledWith({ userId: 'admin', isAdmin: true });
  });

  it('scopes authentication to the delivery prefix', async () => {
    const { router } = createHarness();
    const resolved = await router;
    const response = await resolved.request('/unrelated');
    expect(response.status).toBe(404);
  });
});
