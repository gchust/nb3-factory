import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { databaseManagerToken } from '@nocobase/db';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import type { MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import routes from '../server/routes/index.js';
import { productsApiRoutes } from '../server/routes/products.js';
import {
  ProductError,
  productsServiceToken,
} from '../server/providers/products.js';

/** Minimal stand-in for the authentication plugin's auth contract. */
const fakeAuth = {
  required: (): MiddlewareHandler => async (context, next) => {
    if (!context.req.header('authorization')) {
      return context.json({ code: 'UNAUTHENTICATED', message: '未登录' }, 401);
    }
    return next();
  },
};

function makeApp(resolve: (token: symbol) => unknown): Application {
  return { container: { resolve } } as unknown as Application;
}

function makeProductsApp(service: object): Application {
  return makeApp((token) => {
    if (token === authenticationToken) return fakeAuth;
    if (token === productsServiceToken) return service;
    throw new Error(`Unexpected token: ${String(token)}`);
  });
}

describe('product routes authentication', () => {
  it('rejects every business action without a session', async () => {
    const service = { list: vi.fn() };
    const router = await productsApiRoutes.createRouter(
      makeProductsApp(service),
    );

    const listResponse = await router.request('/products:list', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(listResponse.status).toBe(401);
    expect(await listResponse.json()).toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(service.list).not.toHaveBeenCalled();
  });

  it('routes a signed-in request to the service and answers with data', async () => {
    const service = { list: vi.fn().mockResolvedValue([{ id: 1 }]) };
    const router = await productsApiRoutes.createRouter(
      makeProductsApp(service),
    );

    const response = await router.request('/products:list', {
      method: 'POST',
      body: '{}',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-session',
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ id: 1 }] });
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it('validates input and maps business errors after authentication', async () => {
    const service = {
      create: vi.fn(() => {
        throw new ProductError('PRODUCT_NAME_REQUIRED', '产品名称不能为空。');
      }),
    };
    const router = await productsApiRoutes.createRouter(
      makeProductsApp(service),
    );

    const malformed = await router.request('/products:create', {
      method: 'POST',
      body: '{not json',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-session',
      },
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      code: 'PRODUCT_BODY_INVALID',
    });

    const badId = await router.request('/products:get', {
      method: 'POST',
      body: JSON.stringify({ filter: { id: 'nope' } }),
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-session',
      },
    });
    expect(badId.status).toBe(400);
    expect(await badId.json()).toMatchObject({ code: 'PRODUCT_ID_INVALID' });

    const businessError = await router.request('/products:create', {
      method: 'POST',
      body: JSON.stringify({ values: {} }),
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-session',
      },
    });
    expect(businessError.status).toBe(400);
    expect(await businessError.json()).toMatchObject({
      code: 'PRODUCT_NAME_REQUIRED',
    });
  });
});

/** A fake File repository doubles enough for router construction. */
function makeFileApp(): Application {
  const fakeRepository = {
    validateCollection: vi.fn(),
    getUrl: () => '/uploads/product-images/x.png',
  };
  return makeApp((token) => {
    if (token === authenticationToken) return fakeAuth;
    if (token === serverFileRepositoryManagerToken) {
      return { repository: () => fakeRepository };
    }
    if (token === databaseManagerToken) {
      return { repository: () => ({}) };
    }
    throw new Error(`Unexpected token: ${String(token)}`);
  });
}

describe('product file routes security', () => {
  const [productApiRoutes, fileApiRoutes, fileContentRoutes] = routes;

  it('mounts products, file upload actions and content routes in order', () => {
    expect(productApiRoutes).toBeDefined();
    expect(fileApiRoutes).toBeDefined();
    expect(fileContentRoutes).toBeDefined();
  });

  it('rejects an anonymous upload with 401', async () => {
    const router = await fileApiRoutes!.createRouter(makeFileApp());
    const response = await router.request('/productImages:uploadOne', {
      method: 'POST',
      body: 'not read',
      headers: {
        'content-type': 'multipart/form-data; boundary=boundary',
      },
    });
    expect(response.status).toBe(401);
  });

  it('rejects anonymous content access with 401', async () => {
    const router = await fileContentRoutes!.createRouter(makeFileApp());
    const response = await router.request(
      '/uploads/product-images/20000000-0000-4000-8000-000000000001.png',
    );
    expect(response.status).toBe(401);
  });

  it('keeps the session middleware scoped to the file paths it owns', async () => {
    const router = await fileContentRoutes!.createRouter(makeFileApp());
    const response = await router.request('/some-other-root-path');
    expect(response.status).not.toBe(401);
  });
});
