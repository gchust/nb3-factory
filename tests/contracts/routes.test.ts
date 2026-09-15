import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Hono, MiddlewareHandler } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  contractsServiceToken,
  type ContractsService,
} from '../../server/providers/contracts.js';
import { contractsApiRoutes } from '../../server/routes/contracts.js';

type RequestMode = 'anonymous' | 'deny' | 'permit';

let mode: RequestMode = 'anonymous';

const scope = {
  identity: { principal: { id: 'user-1' } },
  authorize: vi.fn(async () =>
    mode === 'deny'
      ? { effect: 'deny' as const, reasons: [] }
      : {
          effect: 'conditional' as const,
          conditions: {
            type: 'database',
            collection: 'main.contracts',
            action: 'read',
            filter: { $and: [] },
            fields: { input: '*', output: '*' },
          },
          reasons: [],
        },
  ),
};

const required: MiddlewareHandler = async (context, next) => {
  if (mode === 'anonymous') {
    return context.json({ code: 'UNAUTHORIZED' }, 401);
  }
  await next();
};

const authorizationMiddleware: MiddlewareHandler = async (context, next) => {
  (context as unknown as { set(key: string, value: unknown): void }).set(
    'authz',
    scope,
  );
  await next();
};

const service = {
  displayNameFor: async (id: string) => id,
  list: async () => [],
  findById: async () => undefined,
  findAttachment: async () => undefined,
};

let router: Hono;

async function buildRouter(): Promise<void> {
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => required,
  } as unknown as Auth);
  container.instance(authorizationToken, {
    middleware: () => authorizationMiddleware,
  } as unknown as AppAuthorization);
  container.instance(
    contractsServiceToken,
    service as unknown as ContractsService,
  );
  router = await contractsApiRoutes.createRouter({
    container,
  } as unknown as Application);
}

afterEach(() => {
  mode = 'anonymous';
});

describe('contracts API security', () => {
  it('rejects anonymous callers with 401', async () => {
    await buildRouter();
    mode = 'anonymous';

    const list = await router.request('/contracts');
    expect(list.status).toBe(401);

    const download = await router.request(
      '/contracts/contract-1/attachments/attachment-1/download',
    );
    expect(download.status).toBe(401);
  });

  it('rejects an authenticated caller without permission with 403', async () => {
    await buildRouter();
    mode = 'deny';

    const list = await router.request('/contracts');
    expect(list.status).toBe(403);

    const download = await router.request(
      '/contracts/contract-1/attachments/attachment-1/download',
    );
    expect(download.status).toBe(403);
  });

  it('answers a permitted caller with the authorized payload', async () => {
    await buildRouter();
    mode = 'permit';

    const list = await router.request('/contracts');
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual({ data: [] });
  });

  it('reports create capability from the authorization decision', async () => {
    await buildRouter();
    mode = 'permit';

    const response = await router.request('/contracts/capabilities');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { canCreate: true },
    });
  });
});
