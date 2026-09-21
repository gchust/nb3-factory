// @vitest-environment node
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { ServiceContainer } from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import { authenticationToken } from '@nocobase/app-plugin-authentication';

import deliveryApiRoutes from '../../server/routes/delivery.js';
import { deliveryServiceToken } from '../../server/providers/delivery/index.js';

/**
 * The route factory is exercised as it is registered by the application, with
 * its dependencies supplied directly. Authentication is the real middleware
 * contract: a request without a session is rejected before any handler runs.
 */
function buildRouter(): Hono {
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => async (context: never, next: () => Promise<void>) => {
      const header = (
        context as unknown as {
          req: { header(name: string): string | undefined };
        }
      ).req.header('x-test-session');
      if (!header) {
        return (
          context as unknown as {
            json(body: unknown, status: number): Response;
          }
        ).json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }
      (context as unknown as { set(key: string, value: unknown): void }).set(
        'auth',
        {
          user: { id: header, name: header },
          session: {},
        },
      );
      await next();
    },
  } as never);
  container.instance(databaseManagerToken, {
    query: () => ({
      selectFrom: () => {
        throw new Error('The database is not reachable in this test.');
      },
    }),
  } as never);
  container.instance(deliveryServiceToken, {
    contextFor: async (userId: string, name: string) => ({
      actor: { userId, name, roles: new Set(['lead']) },
      scope: {
        readAll: true,
        manageAll: true,
        readableContractIds: new Set<number>(),
        managedContractIds: new Set<number>(),
        acceptedMilestoneIds: new Set<number>(),
      },
    }),
    dashboard: async () => ({
      cards: {
        pendingReview: 2,
        overdueMilestones: 1,
        activeContracts: 3,
        outstandingCents: 500,
        acceptedMilestones: 1,
        totalMilestones: 4,
      },
      pendingReview: [],
      overdueMilestones: [],
      contracts: [],
    }),
    listUsers: async () => [],
  } as never);

  const app = {
    container,
    publicBasePath: '/main',
    config: { get: () => undefined },
  };
  return deliveryApiRoutes.createRouter(app as never) as Hono;
}

describe('delivery API authentication', () => {
  it('rejects an anonymous request with 401', async () => {
    const router = await buildRouter();
    const response = await router.request('/delivery/dashboard');
    expect(response.status).toBe(401);
  });

  it('answers an authenticated request with the resolved payload', async () => {
    const router = await buildRouter();
    const response = await router.request('/delivery/dashboard', {
      headers: { 'x-test-session': 'user-1' },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { cards: { pendingReview: number } };
    };
    expect(body.data.cards.pendingReview).toBe(2);
  });

  it('keeps the registration endpoint public but validates its input', async () => {
    const router = await buildRouter();
    const response = await router.request('/delivery/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '',
        username: 'x',
        email: 'nope',
        password: '1',
      }),
    });
    expect(response.status).toBe(400);
  });

  it('rejects an unknown project identifier before reaching the service', async () => {
    const router = await buildRouter();
    const response = await router.request('/delivery/projects/abc', {
      headers: { 'x-test-session': 'user-1' },
    });
    expect(response.status).toBe(400);
  });

  it('protects the issue and task routes with the same session check', async () => {
    const router = await buildRouter();
    const anonymousIssue = await router.request('/delivery/issues');
    expect(anonymousIssue.status).toBe(401);

    const anonymousTaskUpdate = await router.request('/delivery/tasks/1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    expect(anonymousTaskUpdate.status).toBe(401);

    const badTaskId = await router.request('/delivery/tasks/abc', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-test-session': 'user-1',
      },
      body: JSON.stringify({ status: 'done' }),
    });
    expect(badTaskId.status).toBe(400);
  });
});
