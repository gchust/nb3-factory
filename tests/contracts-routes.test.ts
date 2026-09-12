import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import type { MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  contractsApiRoutes,
  collectFormFiles,
} from '../server/routes/contracts.js';
import { contractsServiceToken } from '../server/providers/contracts.js';

/** Minimal stand-in for the authentication plugin's auth contract. */
const fakeAuth = {
  required: (): MiddlewareHandler => async (context, next) => {
    if (!context.req.header('authorization')) {
      return context.json({ code: 'UNAUTHENTICATED', message: '未登录' }, 401);
    }
    return next();
  },
};

function makeApp(service: object): Application {
  const resolve = (token: symbol): unknown => {
    switch (token) {
      case authenticationToken:
        return fakeAuth;
      case contractsServiceToken:
        return service;
      default:
        throw new Error(
          `Unexpected token resolved in route test: ${String(token)}`,
        );
    }
  };
  return { container: { resolve } } as unknown as Application;
}

async function createRouter(service: object) {
  const contribution = contractsApiRoutes;
  const router = await contribution.createRouter(makeApp(service));
  return router;
}

describe('contract routes authentication', () => {
  it('rejects every business action without a session', async () => {
    const service = { list: vi.fn() };
    const router = await createRouter(service);

    const listResponse = await router.request('/contracts:list', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(listResponse.status).toBe(401);
    expect(await listResponse.json()).toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(service.list).not.toHaveBeenCalled();

    const uploadResponse = await router.request('/contracts:uploadBody', {
      method: 'POST',
      body: 'multipart body never parsed',
      headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
    });
    expect(uploadResponse.status).toBe(401);

    const contentResponse = await router.request(
      '/contracts:fileContent/10000000-0000-4000-8000-000000000001',
      { method: 'GET' },
    );
    expect(contentResponse.status).toBe(401);
  });

  it('routes a signed-in request to the service and answers with data', async () => {
    const service = { list: vi.fn().mockResolvedValue([{ id: 1 }]) };
    const router = await createRouter(service);
    const response = await router.request('/contracts:list', {
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

  it('still enforces business validation after authentication', async () => {
    const service = { create: vi.fn() };
    const router = await createRouter(service);

    const malformed = await router.request('/contracts:create', {
      method: 'POST',
      body: '{not json',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-session',
      },
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      code: 'CONTRACT_BODY_INVALID',
    });
    expect(service.create).not.toHaveBeenCalled();

    const badId = await router.request('/contracts:delete', {
      method: 'POST',
      body: JSON.stringify({ filter: { id: 'nope' } }),
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-session',
      },
    });
    expect(badId.status).toBe(400);
    expect(await badId.json()).toMatchObject({ code: 'CONTRACT_ID_INVALID' });
  });
});

describe('contract upload multipart field names', () => {
  /**
   * The file upload control sends every selected attachment through
   * `uploadOne`, which posts a single multipart field named `file` — the same
   * name the body endpoint reads. The extraction must recognize it alongside
   * the plural `files` convention. (The full multipart round-trip over HTTP is
   * verified against a running server; here the parser-shaped values are
   * exercised directly because the jsdom test environment cannot round-trip
   * multipart bodies through Node's undici parser.)
   */
  it('collects single and repeated `file` fields the control sends', () => {
    const first = new File(['first'], 'note-a.txt', { type: 'text/plain' });
    const second = new File(['second'], 'note-b.txt', {
      type: 'text/plain',
    });
    expect(collectFormFiles(first)).toEqual([first]);
    expect(collectFormFiles([first, second])).toEqual([first, second]);
    expect(collectFormFiles(undefined)).toEqual([]);
    expect(collectFormFiles('note')).toEqual([]);
  });
});
