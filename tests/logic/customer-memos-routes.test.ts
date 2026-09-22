// @vitest-environment node
import type { Auth, AuthEnv } from '@nocobase/app-plugin-authentication';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createCustomerMemoService,
  customerMemoServiceToken,
} from '../../server/providers/memos.js';
import { memoApiRoutes } from '../../server/routes/memos.js';
import {
  createMemoDatabase,
  createTempDirectory,
  MEMO_MIGRATIONS_DIRECTORY,
  MEMO_PACKAGE_NAME,
  removeTempDirectory,
} from '../support/customer-memos-database.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    removeTempDirectory(root);
  }
});

const AUTH_HEADERS = { 'x-test-auth': 'valid' } as const;
const JSON_HEADERS = {
  ...AUTH_HEADERS,
  'content-type': 'application/json',
} as const;

const requireAuth: MiddlewareHandler<AuthEnv> = async (context, next) => {
  if (context.req.header('x-test-auth') !== 'valid') {
    return context.json({ code: 'UNAUTHENTICATED' }, 401);
  }
  await next();
};

async function createHarness() {
  const root = createTempDirectory('customer-memos-routes-');
  roots.push(root);
  const manager = createMemoDatabase(root);
  await manager
    .createMigrator({
      directory: MEMO_MIGRATIONS_DIRECTORY,
      packageName: MEMO_PACKAGE_NAME,
    })
    .latest();

  const container = new ServiceContainer();
  container.instance(
    customerMemoServiceToken,
    createCustomerMemoService(manager),
  );
  container.instance(authenticationToken, {
    required: () => requireAuth,
  } as unknown as Auth);

  const router = memoApiRoutes.createRouter({
    container,
  } as unknown as Application);

  return { router };
}

function create(router: Awaited<ReturnType<typeof createHarness>>['router']) {
  return async (body: unknown) =>
    router.request('/memos', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
}

function list(router: Awaited<ReturnType<typeof createHarness>>['router']) {
  return async (search?: string) =>
    router.request(
      search ? `/memos?search=${encodeURIComponent(search)}` : '/memos',
      { headers: AUTH_HEADERS },
    );
}

describe('memo API authentication', () => {
  it('rejects an anonymous request', async () => {
    const { router } = await createHarness();
    const response = await router.request('/memos');
    expect(response.status).toBe(401);
  });
});

describe('memo API create and list', () => {
  it('creates a memo that the list then returns', async () => {
    const { router } = await createHarness();
    const post = create(router);

    const created = await post({ customerName: 'Acme', content: 'hello' });
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.data).toMatchObject({
      customerName: 'Acme',
      content: 'hello',
    });
    expect(typeof createdBody.data.id).toBe('number');

    const response = await list(router)();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      customerName: 'Acme',
      content: 'hello',
    });
  });

  it('stores the memo without content when the memo is omitted', async () => {
    const { router } = await createHarness();
    const created = await create(router)({ customerName: 'No note' });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.data.content).toBeNull();
  });

  it('rejects a memo without a customer name and writes nothing', async () => {
    const { router } = await createHarness();
    const response = await create(router)({
      customerName: '   ',
      content: 'lost',
    });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('VALIDATION_ERROR');

    const body = await (await list(router)()).json();
    expect(body.data).toEqual([]);
  });

  it('rejects a body that is not JSON', async () => {
    const { router } = await createHarness();
    const response = await router.request('/memos', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: 'not json',
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_JSON');
  });
});

describe('memo API search', () => {
  it('filters by a partial customer name and returns everything without one', async () => {
    const { router } = await createHarness();
    const post = create(router);
    await post({ customerName: '北京华信科技有限公司' });
    await post({ customerName: '上海远景贸易有限公司' });

    const filtered = await (await list(router)('华信')).json();
    expect(filtered.data.map((memo) => memo.customerName)).toEqual([
      '北京华信科技有限公司',
    ]);

    const all = await (await list(router)()).json();
    expect(all.data).toHaveLength(2);
  });
});

describe('memo API update and delete', () => {
  it('updates a memo and reports a missing one', async () => {
    const { router } = await createHarness();
    const created = await (
      await create(router)({ customerName: 'Before' })
    ).json();

    const updated = await router.request(`/memos/${created.data.id}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ customerName: 'After', content: 'changed' }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).data).toMatchObject({
      customerName: 'After',
      content: 'changed',
    });

    const missing = await router.request('/memos/999', {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ customerName: 'Ghost' }),
    });
    expect(missing.status).toBe(404);
  });

  it('deletes a memo, then reports it as missing', async () => {
    const { router } = await createHarness();
    const created = await (
      await create(router)({ customerName: 'Delete me' })
    ).json();

    const deleted = await router.request(`/memos/${created.data.id}`, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(deleted.status).toBe(204);

    const again = await router.request(`/memos/${created.data.id}`, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(again.status).toBe(404);

    const body = await (await list(router)()).json();
    expect(body.data).toEqual([]);
  });
});
