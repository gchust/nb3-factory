import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import { ServiceContainer } from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { INSPECTION_ROLES } from '../../server/providers/inspection-roles.js';
import { inspectionServiceToken } from '../../server/providers/inspection.js';
import type { InspectionService } from '../../server/providers/inspection-service.js';
import { inspectionApiRoutes } from '../../server/routes/inspection.js';

const ROLES_BY_USER: Readonly<Record<string, readonly string[]>> = {
  'admin-1': ['system-administrator'],
  'lead-1': [INSPECTION_ROLES.teamLead],
  'inspector-1': [INSPECTION_ROLES.inspector],
  'viewer-1': [INSPECTION_ROLES.viewer],
};

const fileId = '11111111-1111-4111-8111-111111111111';

function createService(): InspectionService {
  return {
    listDevices: vi.fn(async () => []),
    findDevice: vi.fn(async () => ({
      id: 1,
      code: 'DEV-001',
      name: 'Device',
      location: 'A',
      type: 'pump',
      status: 'in_use',
    })),
    createDevice: vi.fn(async () => 1),
    updateDevice: vi.fn(async () => 1),
    listPlans: vi.fn(async () => []),
    findPlan: vi.fn(async () => undefined),
    createPlan: vi.fn(async () => 1),
    updatePlan: vi.fn(async () => 1),
    listRecords: vi.fn(async () => []),
    getRecord: vi.fn(async () => ({
      id: 7,
      deviceId: 1,
      planId: null,
      result: 'abnormal',
      description: null,
      team: null,
      createdById: 'inspector-1',
      createdByName: 'Inspector',
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
    })),
    listPhotos: vi.fn(async () => []),
    fileIdsForRecord: vi.fn(async () => []),
    existingFileIds: vi.fn(async () => [fileId]),
    createRecord: vi.fn(async () => 7),
    updateRecord: vi.fn(async () => 1),
    deleteRecordPhoto: vi.fn(async () => true),
    deviceStats: vi.fn(async () => []),
  };
}

function createAuthorization() {
  return {
    permissionSets: {
      listAssignments: async () =>
        Object.entries(ROLES_BY_USER).flatMap(([id, sets]) =>
          sets.map((permissionSet) => ({
            subject: { type: 'user', id },
            permissionSet,
          })),
        ),
      get: async () => undefined,
      create: async (input: { key: string }) => ({
        key: input.key,
        grants: [],
      }),
      withConnection: () => undefined,
    },
  };
}

let router: {
  request: (input: string, init?: RequestInit) => Promise<Response>;
};
let service: InspectionService;
let users: { create: ReturnType<typeof vi.fn> };

beforeAll(async () => {
  const auth = {
    required(): MiddlewareHandler<AuthEnv> {
      return async (context, next) => {
        const id = context.req.header('x-test-user');
        if (!id) return context.json({ code: 'UNAUTHORIZED' }, 401);
        context.set('auth', {
          user: { id, name: id, email: `${id}@example.invalid` },
          session: { id: 'session' },
        } as never);
        await next();
      };
    },
  };

  service = createService();
  users = { create: vi.fn(async () => ({ id: 'new-user' })) };

  const container = new ServiceContainer();
  container.instance(authenticationToken, auth as never);
  container.instance(authorizationToken, createAuthorization() as never);
  container.instance(inspectionServiceToken, service);
  container.instance(userManagementServiceToken, users as never);

  router = (await inspectionApiRoutes.createRouter({
    container,
    publicBasePath: '/main',
  } as never)) as never;
});

describe('inspection API authentication', () => {
  it('rejects an anonymous records request', async () => {
    const response = await router.request('/inspection/records');
    expect(response.status).toBe(401);
  });

  it('rejects an anonymous device mutation', async () => {
    const response = await router.request('/inspection/devices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(401);
  });
});

describe('inspection API authorization', () => {
  it('does not let a viewer create a record', async () => {
    const response = await router.request('/inspection/records', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'viewer-1',
      },
      body: JSON.stringify({
        deviceId: 1,
        result: 'normal',
        photoIds: [fileId],
      }),
    });
    expect(response.status).toBe(403);
    expect(service.createRecord).not.toHaveBeenCalled();
  });

  it('lets an inspector withdraw a photo from their own record', async () => {
    const response = await router.request(
      `/inspection/records/7/photos/${fileId}`,
      { method: 'DELETE', headers: { 'x-test-user': 'inspector-1' } },
    );
    expect(response.status).toBe(200);
    expect(service.deleteRecordPhoto).toHaveBeenCalledWith(7, fileId);
  });

  it('stops an inspector deleting a photo from someone else record', async () => {
    vi.clearAllMocks();
    (service.getRecord as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 7,
      deviceId: 1,
      planId: null,
      result: 'normal',
      description: null,
      team: null,
      createdById: 'inspector-2',
      createdByName: null,
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
    });
    const response = await router.request(
      `/inspection/records/7/photos/${fileId}`,
      { method: 'DELETE', headers: { 'x-test-user': 'inspector-1' } },
    );
    expect(response.status).toBe(403);
    expect(service.deleteRecordPhoto).not.toHaveBeenCalledWith(7, fileId);
  });

  it('lets a team lead delete one photo', async () => {
    const response = await router.request(
      `/inspection/records/7/photos/${fileId}`,
      { method: 'DELETE', headers: { 'x-test-user': 'lead-1' } },
    );
    expect(response.status).toBe(200);
    expect(service.deleteRecordPhoto).toHaveBeenCalledWith(7, fileId);
  });

  it('does not let an inspector manage the equipment catalog', async () => {
    const response = await router.request('/inspection/devices', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'inspector-1',
      },
      body: JSON.stringify({
        code: 'D-1',
        name: 'n',
        location: 'l',
        type: 't',
        status: 'in_use',
      }),
    });
    expect(response.status).toBe(403);
    expect(service.createDevice).not.toHaveBeenCalled();
  });

  it('lets an administrator manage the equipment catalog', async () => {
    const response = await router.request('/inspection/devices', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': 'admin-1' },
      body: JSON.stringify({
        code: 'D-1',
        name: 'n',
        location: 'l',
        type: 't',
        status: 'in_use',
      }),
    });
    expect(response.status).toBe(201);
    expect(service.createDevice).toHaveBeenCalled();
  });
});

describe('inspection record rules', () => {
  it('rejects a record without a photo', async () => {
    const response = await router.request('/inspection/records', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'inspector-1',
      },
      body: JSON.stringify({ deviceId: 1, result: 'normal', photoIds: [] }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'PHOTOS_REQUIRED' });
    expect(service.createRecord).not.toHaveBeenCalled();
  });

  it('rejects a record referencing an unknown photo', async () => {
    (service.existingFileIds as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      [],
    );
    const response = await router.request('/inspection/records', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'inspector-1',
      },
      body: JSON.stringify({
        deviceId: 1,
        result: 'normal',
        photoIds: [fileId],
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'PHOTO_NOT_FOUND' });
  });

  it('creates a record for the caller with the uploaded photos', async () => {
    const response = await router.request('/inspection/records', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'inspector-1',
      },
      body: JSON.stringify({
        deviceId: 1,
        result: 'abnormal',
        description: 'noise',
        photoIds: [fileId],
      }),
    });
    expect(response.status).toBe(201);
    expect(service.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        createdById: 'inspector-1',
        result: 'abnormal',
        photoIds: [fileId],
      }),
    );
  });

  it('scopes an inspector to their own records', async () => {
    await router.request('/inspection/records', {
      headers: { 'x-test-user': 'inspector-1' },
    });
    expect(service.listRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ createdById: 'inspector-1' }),
    );
  });

  it('gives a viewer the full list', async () => {
    await router.request('/inspection/records', {
      headers: { 'x-test-user': 'viewer-1' },
    });
    expect(service.listRecords).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ createdById: expect.anything() }),
    );
  });

  it('hides a record an inspector does not own', async () => {
    (service.getRecord as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 7,
      deviceId: 1,
      planId: null,
      result: 'normal',
      description: null,
      team: null,
      createdById: 'someone-else',
      createdByName: null,
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
    });
    const response = await router.request('/inspection/records/7', {
      headers: { 'x-test-user': 'inspector-1' },
    });
    expect(response.status).toBe(404);
  });
});

describe('inspection self-registration', () => {
  it('assigns the selected inspection role', async () => {
    const response = await router.request('/inspection-registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Someone',
        username: 'someone',
        email: 'someone@example.invalid',
        password: 'Passw0rd-A9!',
        role: 'viewer',
      }),
    });
    expect(response.status).toBe(201);
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        roleScopes: { app: [INSPECTION_ROLES.viewer] },
      }),
    );
  });

  it('refuses to grant the administrator role', async () => {
    users.create.mockClear();
    const response = await router.request('/inspection-registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Someone',
        username: 'someone',
        email: 'someone@example.invalid',
        password: 'Passw0rd-A9!',
        role: 'admin',
      }),
    });
    expect(response.status).toBe(400);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('rejects a username the sign-in endpoint would refuse', async () => {
    users.create.mockClear();
    const response = await router.request('/inspection-registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Someone',
        username: 'ab',
        email: 'someone@example.invalid',
        password: 'Passw0rd-A9!',
        role: 'inspector',
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_USERNAME' });
    expect(users.create).not.toHaveBeenCalled();
  });
});
