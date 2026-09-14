import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationScope,
} from '@nocobase/app-plugin-authorization';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Context, Next } from 'hono';
import { describe, expect, it } from 'vitest';

import { RetailError } from '../../server/providers/retail/types.js';
import { retailServiceToken } from '../../server/providers/retail/tokens.js';
import { retailApiRoutes } from '../../server/routes/retail.js';

interface TestAuthorization {
  readonly calls: unknown[];
  readonly middleware: () => (context: Context, next: Next) => Promise<void>;
  setDecision: (effect: 'conditional' | 'deny') => void;
}

function createAuthorization(): TestAuthorization {
  const calls: unknown[] = [];
  let effect: 'conditional' | 'deny' = 'conditional';
  const scope = {
    identity: { principal: { type: 'user', id: 'user-1' } },
    authorize: async (request: {
      resource: { id: string };
      action: string;
    }) => {
      calls.push(request);
      if (effect === 'deny') return { effect: 'deny', reasons: [] };
      return {
        effect: 'conditional',
        conditions: {
          type: 'database',
          collection: request.resource.id,
          action: request.action,
          filter: { $and: [] },
          fields: { input: '*', output: '*' },
        },
        reasons: [],
      };
    },
    can: async () => effect === 'conditional',
    require: async () => undefined,
    explain: async () => ({ effect, reasons: [] }),
    permissions: async () => ({ permissions: [] }),
  };
  return {
    calls,
    middleware: () => async (context, next) => {
      context.set('authz', scope as unknown as AuthorizationScope);
      await next();
    },
    setDecision: (next) => {
      effect = next;
    },
  };
}

function createAuth() {
  return {
    required: () => async (context: Context, next: Next) => {
      const user = context.req.header('x-test-user');
      if (!user) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }
      context.set('auth', {
        user: { id: user, name: 'Tester' },
        session: {},
      });
      return next();
    },
  };
}

async function buildRouter(options: {
  readonly authorizationEffect: 'conditional' | 'deny';
  readonly service?: Record<string, unknown>;
}) {
  const container = new ServiceContainer();
  const authorization = createAuthorization();
  authorization.setDecision(options.authorizationEffect);
  const auth = createAuth();

  container.instance(authenticationToken, auth as never);
  container.instance(authorizationToken, {
    middleware: authorization.middleware,
  } as never);
  container.instance(retailServiceToken, (options.service ?? {}) as never);

  const router = await retailApiRoutes.createRouter({
    container,
  } as never);
  return { router, authorization };
}

function failingService(code: string): Record<string, unknown> {
  const fail = () => Promise.reject(new RetailError(code as never, code, 409));
  return {
    listProducts: fail,
    listManagedProducts: fail,
    createProduct: fail,
    updateProduct: fail,
    listOrders: fail,
    createOrder: fail,
    returnOrder: fail,
    listPurchases: fail,
    createPurchase: fail,
    dailyReport: fail,
  };
}

describe('retail API routes', () => {
  it('rejects an anonymous request with 401', async () => {
    const { router } = await buildRouter({
      authorizationEffect: 'conditional',
    });
    const response = await router.request('/retail/products');
    expect(response.status).toBe(401);
  });

  it('rejects a request the authorization layer denies with 403', async () => {
    const { router } = await buildRouter({ authorizationEffect: 'deny' });
    const response = await router.request('/retail/products', {
      headers: { 'x-test-user': 'user-1' },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'AUTHORIZATION_DENIED',
    });
  });

  it('passes the authorization conditions to the service and returns its data', async () => {
    const products = [{ id: 1, name: 'Cola', price: 3.5, stock: 5 }];
    let seen: unknown;
    const service = {
      listProducts: async (
        _filters: unknown,
        conditions: unknown,
      ): Promise<unknown> => {
        seen = conditions;
        return products;
      },
    };
    const { router } = await buildRouter({
      authorizationEffect: 'conditional',
      service,
    });
    const response = await router.request('/retail/products', {
      headers: { 'x-test-user': 'user-1' },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: products });
    expect(seen).toMatchObject({
      type: 'database',
      collection: 'main.retailProducts',
      action: 'read',
    });
  });

  it('maps a domain failure to its HTTP status and code', async () => {
    const { router } = await buildRouter({
      authorizationEffect: 'conditional',
      service: failingService('INSUFFICIENT_STOCK'),
    });
    const response = await router.request('/retail/sales-orders', {
      method: 'POST',
      headers: { 'x-test-user': 'user-1', 'content-type': 'application/json' },
      body: JSON.stringify({
        paymentMethod: 'cash',
        discountPercent: 0,
        items: [{ productId: 1, quantity: 2 }],
      }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
    });
  });
});
