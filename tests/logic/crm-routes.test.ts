import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono, type Context, type Next } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  crmServiceToken,
  type CrmService,
} from '../../server/providers/crm/index.js';
import { crmApiRoutes } from '../../server/routes/crm/index.js';

interface HarnessOptions {
  readonly anonymous?: boolean;
  readonly deny?: boolean;
  readonly assignments?: readonly {
    id: string;
    subject: { type: string; id: string };
    permissionSet: string;
  }[];
  readonly service?: Partial<Record<keyof CrmService, unknown>>;
}

function authDouble(anonymous: boolean): Auth {
  const required = async (
    context: Context,
    next: Next,
  ): Promise<Response | void> => {
    if (anonymous) {
      return context.json({ code: 'UNAUTHORIZED' }, 401);
    }
    context.set('auth', { user: { id: 'u1' }, session: {} });
    await next();
  };
  return {
    required: () => required,
    optional: () => async (_context: Context, next: Next) => {
      await next();
    },
  } as unknown as Auth;
}

function authorizationDouble(options: HarnessOptions): AppAuthorization {
  const scope = {
    identity: { principal: { type: 'user', id: 'u1' }, subjects: [] },
    authorize: async () =>
      options.deny
        ? { effect: 'deny', reasons: [] }
        : {
            effect: 'conditional',
            conditions: {
              type: 'database',
              collection: 'main.crmCustomers',
              action: 'read',
              filter: { $and: [] },
              fields: { input: '*', output: '*' },
            },
            reasons: [],
          },
  };
  const middleware = async (context: Context, next: Next): Promise<void> => {
    context.set('authz', scope);
    await next();
  };
  return {
    middleware: () => middleware,
    permissionSets: {
      listAssignments: async () => options.assignments ?? [],
    },
  } as unknown as AppAuthorization;
}

async function buildHarness(options: HarnessOptions = {}): Promise<Hono> {
  const container = new ServiceContainer();
  const service = {
    listCustomers: async () => [{ id: 1, name: 'Acme' }],
    createCustomer: async () => 1,
    funnel: async () => ({
      byStage: [],
      totalCount: 0,
      totalAmount: 0,
      newThisMonth: 0,
      wonCount: 0,
      closedCount: 0,
      winRate: null,
    }),
    ...options.service,
  } as unknown as CrmService;

  container.instance(
    authenticationToken,
    authDouble(options.anonymous === true) as never,
  );
  container.instance(authorizationToken, authorizationDouble(options) as never);
  container.instance(crmServiceToken, service as never);
  container.instance(userManagementServiceToken, {
    list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
  } as never);
  container.instance(serverFileRepositoryManagerToken, {
    repository: () => ({}),
  } as never);
  container.instance(driveManagerToken, {} as never);

  const app = { container } as unknown as Application;
  return crmApiRoutes.createRouter(app);
}

describe('CRM route authentication', () => {
  it('rejects an anonymous request', async () => {
    const router = await buildHarness({ anonymous: true });
    const response = await router.request('/crm/me');
    expect(response.status).toBe(401);
  });
});

describe('CRM route authorization', () => {
  it('denies a request the authorizer refuses', async () => {
    const router = await buildHarness({ deny: true });
    const response = await router.request('/crm/customers');
    expect(response.status).toBe(403);
  });

  it('returns the authorized rows', async () => {
    const router = await buildHarness();
    const response = await router.request('/crm/customers');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ id: 1, name: 'Acme' }] });
  });
});

describe('CRM manager-only routes', () => {
  it('denies the owner list to a sales representative', async () => {
    const router = await buildHarness();
    const response = await router.request('/crm/owners');
    expect(response.status).toBe(403);
  });

  it('allows the owner list to an administrator', async () => {
    const router = await buildHarness({
      assignments: [
        {
          id: 'user:u1:system-administrator',
          subject: { type: 'user', id: 'u1' },
          permissionSet: 'system-administrator',
        },
      ],
      service: {},
    });
    const response = await router.request('/crm/owners');
    expect(response.status).toBe(200);
  });
});

describe('CRM ownership on create', () => {
  it('forces a sales representative to own the record they create', async () => {
    const createCustomer = vi.fn(async () => 5);
    const router = await buildHarness({
      service: { createCustomer },
    });
    const response = await router.request('/crm/customers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Rep Co', ownerId: 'someone-else' }),
    });
    expect(response.status).toBe(201);
    expect(createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Rep Co' }),
      'u1',
    );
  });
});
