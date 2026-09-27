// @vitest-environment node
import {
  authenticationToken,
  type Auth,
  type AuthEnv,
  type AuthSession,
} from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';
import { describe, expect, it } from 'vitest';

import { serviceRoutes } from '../../server/routes/service.js';
import {
  ServiceError,
  serviceAccessToken,
  type ServiceAccessService,
  type ServiceIdentity,
} from '../../server/service/access.js';

/**
 * The security boundary of the after-sales service HTTP surface.
 *
 * The router factory is the production one; only the session and business
 * identity services are supplied as doubles, because the point of these cases
 * is that the boundary is enforced by the route itself rather than by whatever
 * order routes happen to be mounted in. A caller with no session is rejected
 * before any handler runs, and a caller whose account carries no service role
 * is rejected by the access service.
 */

const ADMIN: ServiceIdentity = {
  userId: 'user-admin',
  roles: ['service-admin'],
  membershipIds: [],
  regions: [],
  manageAll: true,
  allTickets: true,
  regionTickets: false,
  assignedTickets: false,
  sharedTickets: false,
  internalFields: true,
  manageKnowledge: true,
  manageInspections: true,
  shareTickets: true,
  integrationEvents: true,
  assistant: true,
  customers: 'all',
  devices: 'all',
};

interface Scenario {
  readonly authenticated: boolean;
  readonly member: boolean;
}

async function createTestRouter(scenario: Scenario) {
  const container = new ServiceContainer();

  const required = (): MiddlewareHandler<AuthEnv> => async (context, next) => {
    if (!scenario.authenticated) {
      return context.json(
        { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
        401,
      );
    }
    context.set('auth', {
      user: { id: 'user-admin' },
    } as unknown as AuthSession);
    await next();
    return undefined;
  };
  container.instance(authenticationToken, { required } as unknown as Auth);

  const access = {
    identityFor: (): Promise<ServiceIdentity> => {
      if (!scenario.member) {
        return Promise.reject(
          new ServiceError(403, 'SERVICE_ACCESS_DENIED', 'no service role'),
        );
      }
      return Promise.resolve(ADMIN);
    },
  } as unknown as ServiceAccessService;
  container.instance(serviceAccessToken, access);

  const app = { container } as unknown as Application;
  return serviceRoutes.createRouter(app);
}

describe('after-sales service routes', () => {
  it('rejects an anonymous caller before any handler runs', async () => {
    const router = await createTestRouter({
      authenticated: false,
      member: false,
    });
    const response = await router.request('/service/me');
    expect(response.status).toBe(401);
  });

  it('rejects an anonymous device platform event', async () => {
    const router = await createTestRouter({
      authenticated: false,
      member: false,
    });
    const response = await router.request('/service/integration/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);
  });

  it('rejects an account that carries no service role', async () => {
    const router = await createTestRouter({
      authenticated: true,
      member: false,
    });
    const response = await router.request('/service/me');
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SERVICE_ACCESS_DENIED',
    });
  });

  it('answers a member with their own resolved identity', async () => {
    const router = await createTestRouter({
      authenticated: true,
      member: true,
    });
    const response = await router.request('/service/me');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: ADMIN });
  });
});
