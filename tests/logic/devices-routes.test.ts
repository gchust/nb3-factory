// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono, type MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  deviceServiceToken,
  type Device,
  type DeviceService,
} from '../../server/providers/devices.ts';
import { devicesApiRoutes } from '../../server/routes/devices.ts';

const SESSION_COOKIE = 'session=test';

const device: Device = {
  id: 'd1',
  reference: 'DEV-0001',
  name: 'Projector',
  status: 'available',
  remark: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/**
 * A router built from the real contribution with test doubles in the container, as the testing guide describes: the
 * production factory runs, including its dependency resolution and middleware.
 */
function createHarness(overrides: Partial<DeviceService> = {}) {
  const service = {
    list: vi.fn(async () => ({
      data: [device],
      page: 1,
      pageSize: 20,
      total: 1,
    })),
    findById: vi.fn(async (id: string) =>
      id === device.id ? device : undefined,
    ),
    referenceExists: vi.fn(async () => false),
    create: vi.fn(async (input) => ({ ...device, id: 'd2', ...input })),
    update: vi.fn(async (id: string, input) =>
      id === device.id ? { ...device, ...input } : undefined,
    ),
    ...overrides,
  } as unknown as DeviceService;

  // Stand-in for the real `Auth.required()` middleware: identity only, the same boundary the routes install.
  const requireSession: MiddlewareHandler = async (context, next) => {
    if (context.req.header('cookie') !== SESSION_COOKIE) {
      throw new ApiError({
        status: 'UNAUTHENTICATED',
        reason: 'AUTHENTICATION_REQUIRED',
        domain: 'authentication',
        message: 'Sign in to continue.',
      });
    }
    await next();
  };

  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => requireSession,
  } as never);
  container.instance(deviceServiceToken, service);

  const application = {
    appName: 'test',
    publicBasePath: '/main',
    container,
    router: new Hono(),
  } as unknown as Application;

  return { service, application };
}

async function createRouter(application: Application): Promise<Hono> {
  const router = await devicesApiRoutes.createRouter(application);
  // A bare router has no `/api` handler; without this every thrown ApiError would surface as a 500.
  router.onError(apiErrorHandler);
  return router;
}

describe('device API routes', () => {
  it('declares every endpoint in the API document', async () => {
    const { application } = createHarness();
    const router = await createRouter(application);
    // A route with no describeRoute() is a defect, not a documentation gap.
    expect(findUndeclaredApiRoutes(router)).toEqual([]);
  });

  it('refuses an anonymous request', async () => {
    const { application, service } = createHarness();
    const router = await createRouter(application);
    const response = await router.request('/devices');
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { status: 'UNAUTHENTICATED' },
    });
    expect(service.list).not.toHaveBeenCalled();
  });

  it('lists devices for a signed-in user', async () => {
    const { application, service } = createHarness();
    const router = await createRouter(application);
    const response = await router.request('/devices', {
      headers: { cookie: SESSION_COOKIE },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [device],
      meta: { page: 1, pageSize: 20, total: 1 },
    });
    expect(service.list).toHaveBeenCalledWith({
      status: undefined,
      page: 1,
      pageSize: 20,
    });
  });

  it('passes the status filter through', async () => {
    const { application, service } = createHarness();
    const router = await createRouter(application);
    const response = await router.request('/devices?status=borrowed', {
      headers: { cookie: SESSION_COOKIE },
    });
    expect(response.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith({
      status: 'borrowed',
      page: 1,
      pageSize: 20,
    });
  });

  it('rejects an unknown status with a 400', async () => {
    const { application, service } = createHarness();
    const router = await createRouter(application);
    const response = await router.request('/devices?status=lost', {
      headers: { cookie: SESSION_COOKIE },
    });
    expect(response.status).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('answers a missing device with a 404', async () => {
    const { application } = createHarness();
    const router = await createRouter(application);
    const response = await router.request('/devices/missing', {
      headers: { cookie: SESSION_COOKIE },
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { status: 'NOT_FOUND', reason: 'DEVICE_NOT_FOUND' },
    });
  });

  it('creates a device and refuses a duplicate reference', async () => {
    const { application, service } = createHarness();
    const router = await createRouter(application);
    const body = JSON.stringify({
      reference: 'DEV-0002',
      name: 'Headphones',
      status: 'borrowed',
      remark: null,
    });
    const created = await router.request('/devices', {
      method: 'POST',
      headers: { cookie: SESSION_COOKIE, 'content-type': 'application/json' },
      body,
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      data: { id: 'd2', reference: 'DEV-0002' },
    });
    expect(service.create).toHaveBeenCalledWith({
      reference: 'DEV-0002',
      name: 'Headphones',
      status: 'borrowed',
      remark: null,
    });

    const conflictHarness = createHarness({
      referenceExists: vi.fn(async () => true),
    });
    const conflictRouter = await createRouter(conflictHarness.application);
    const duplicate = await conflictRouter.request('/devices', {
      method: 'POST',
      headers: { cookie: SESSION_COOKIE, 'content-type': 'application/json' },
      body,
    });
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: { status: 'ALREADY_EXISTS', reason: 'DEVICE_REFERENCE_TAKEN' },
    });
    expect(conflictHarness.service.create).not.toHaveBeenCalled();
  });

  it('updates a device and answers a missing one with a 404', async () => {
    const { application, service } = createHarness();
    const router = await createRouter(application);
    const updated = await router.request(`/devices/${device.id}`, {
      method: 'PATCH',
      headers: { cookie: SESSION_COOKIE, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'borrowed' }),
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      data: { id: 'd1', status: 'borrowed' },
    });
    expect(service.update).toHaveBeenCalledWith('d1', { status: 'borrowed' });

    const missing = await router.request('/devices/missing', {
      method: 'PATCH',
      headers: { cookie: SESSION_COOKIE, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'borrowed' }),
    });
    expect(missing.status).toBe(404);
  });
});
