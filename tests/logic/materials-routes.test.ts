// @vitest-environment node

import { Hono } from 'hono';
import { RepositoryError } from '@nocobase/db';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import materialsRoutes from '../../server/routes/materials.js';
import {
  MaterialsNotPermittedError,
  materialsServiceToken,
  type MaterialsService,
} from '../../server/materials/service.js';

/**
 * The routes own their HTTP translation: authentication resolves an identity
 * through the framework middleware, and this file supplies a stand-in for that
 * middleware plus the domain service, so a status code can be asserted without
 * a database. The framework's own authentication is exercised by the running
 * application.
 */
const AUTHZ_CONTEXT = { principal: { type: 'user', id: '1' } };

const viewAllowed = {
  read: { scope: true },
  create: false,
  update: false,
  delete: false,
};
const viewDenied = { read: false, create: false, update: false, delete: false };
const manageAllowed = {
  read: { scope: true },
  create: { fields: true },
  update: { fields: true },
  delete: true,
};

interface ServiceStub {
  viewPolicy: ReturnType<typeof vi.fn>;
  managePolicy: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function createStub(overrides: Partial<ServiceStub> = {}): ServiceStub {
  return {
    viewPolicy: vi.fn().mockResolvedValue(viewAllowed),
    managePolicy: vi.fn().mockResolvedValue(manageAllowed),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

function buildRouter(service: ServiceStub): Hono {
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => async (_context: unknown, next: () => Promise<void>) => {
      await next();
    },
  } as never);
  container.instance(authorizationToken, {
    middleware:
      () =>
      async (
        context: { set: (key: string, value: unknown) => void },
        next: () => Promise<void>,
      ) => {
        context.set('authz', AUTHZ_CONTEXT);
        await next();
      },
  } as never);
  container.instance(
    materialsServiceToken,
    service as unknown as MaterialsService,
  );
  return materialsRoutes.createRouter({
    container,
  } as never) as Hono;
}

describe('materials api routes', () => {
  it('lists only what the read policy selected', async () => {
    const list = vi.fn().mockResolvedValue([{ id: 1, title: 'A' }]);
    const router = buildRouter(createStub({ list }));

    const response = await router.request('/materials?limit=5');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 1, title: 'A' }],
    });
    expect(list).toHaveBeenCalledWith(AUTHZ_CONTEXT, {
      limit: 5,
      offset: undefined,
    });
  });

  it('forbids the list when the identity has no view grant', async () => {
    const list = vi.fn();
    const router = buildRouter(
      createStub({ viewPolicy: vi.fn().mockResolvedValue(viewDenied), list }),
    );

    const response = await router.request('/materials');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN' });
    expect(list).not.toHaveBeenCalled();
  });

  it('reads one material, and hides one the policy does not select', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ id: 1, title: 'A' })
      .mockResolvedValueOnce(undefined);
    const router = buildRouter(createStub({ get }));

    const found = await router.request('/materials/1');
    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toEqual({
      data: { id: 1, title: 'A' },
    });

    const hidden = await router.request('/materials/3');
    expect(hidden.status).toBe(404);
    await expect(hidden.json()).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a non-numeric id without calling the service', async () => {
    const get = vi.fn();
    const router = buildRouter(createStub({ get }));

    const response = await router.request('/materials/abc');

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it('creates a material with a trimmed title and the original body', async () => {
    const create = vi.fn().mockResolvedValue({ id: 9, title: 'New' });
    const router = buildRouter(createStub({ create }));

    const response = await router.request('/materials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '  New  ', content: 'body\n' }),
    });

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(AUTHZ_CONTEXT, {
      title: 'New',
      content: 'body\n',
    });
  });

  it('rejects an empty write body', async () => {
    const create = vi.fn();
    const router = buildRouter(createStub({ create }));

    const response = await router.request('/materials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ', content: '   ' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('translates a denied create into 403', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(new MaterialsNotPermittedError('create'));
    const router = buildRouter(createStub({ create }));

    const response = await router.request('/materials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New', content: 'body' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'FORBIDDEN',
      message: 'The current identity may not create materials',
    });
  });

  it('updates, and reports a missing record as 404', async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce({ id: 1, title: 'Edited' })
      .mockRejectedValueOnce(
        new RepositoryError('RECORD_NOT_FOUND', 'no such record'),
      );
    const router = buildRouter(createStub({ update }));

    const edited = await router.request('/materials/1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Edited', content: 'body' }),
    });
    expect(edited.status).toBe(200);
    await expect(edited.json()).resolves.toEqual({
      data: { id: 1, title: 'Edited' },
    });

    const missing = await router.request('/materials/4', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Edited', content: 'body' }),
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('deletes with 204, and reports nothing removed as 404', async () => {
    const remove = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const router = buildRouter(createStub({ remove }));

    const removed = await router.request('/materials/4', { method: 'DELETE' });
    expect(removed.status).toBe(204);

    const missing = await router.request('/materials/5', { method: 'DELETE' });
    expect(missing.status).toBe(404);
  });

  it('leaves paths it does not own to the rest of the application', async () => {
    const router = buildRouter(createStub());

    const response = await router.request('/health');

    expect(response.status).toBe(404);
  });
});
