import { Readable } from 'node:stream';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  ContractError,
  contractsServiceToken,
} from '../server/providers/contracts.js';
import { contractsApiRoutes } from '../server/routes/contracts.js';

const fakeAuth = {
  required: (): MiddlewareHandler => async (context, next) => {
    if (!context.req.header('authorization')) {
      return context.json({ code: 'UNAUTHENTICATED', message: '未登录' }, 401);
    }
    return next();
  },
};

function makeApp(service: object, drive?: object): Application {
  const resolve = (token: symbol): unknown => {
    switch (token) {
      case authenticationToken:
        return fakeAuth;
      case contractsServiceToken:
        return service;
      case driveManagerToken:
        return drive;
      default:
        throw new Error(`Unexpected token in route test: ${String(token)}`);
    }
  };
  return { container: { resolve } } as unknown as Application;
}

async function createRouter(service: object, drive?: object) {
  return contractsApiRoutes.createRouter(makeApp(service, drive));
}

describe('contract routes authentication', () => {
  it('rejects every path without a session', async () => {
    const service = { list: vi.fn(), get: vi.fn() };
    const router = await createRouter(service);

    for (const request of [
      { path: '/contracts', method: 'GET' },
      { path: '/contracts/1', method: 'GET' },
      { path: '/contracts', method: 'POST', body: '{}' },
      { path: '/contracts/attachments', method: 'POST', body: 'x' },
      {
        path: '/contracts/attachments/20000000-0000-4000-8000-000000000001/content',
        method: 'GET',
      },
    ]) {
      const response = await router.request(request.path, {
        method: request.method,
        body: request.body,
        headers: request.body ? { 'content-type': 'application/json' } : {},
      });
      expect(response.status, `${request.method} ${request.path}`).toBe(401);
    }
    expect(service.list).not.toHaveBeenCalled();
  });

  it('passes the category filter through on a signed-in list', async () => {
    const service = {
      list: vi.fn().mockResolvedValue([{ id: 1, category: 'procurement' }]),
    };
    const router = await createRouter(service);
    const response = await router.request('/contracts?category=procurement', {
      headers: { authorization: 'Bearer test' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [{ id: 1, category: 'procurement' }],
    });
    expect(service.list).toHaveBeenCalledWith('procurement');
  });

  it('authenticates then validates the request body', async () => {
    const service = { create: vi.fn() };
    const router = await createRouter(service);

    const malformed = await router.request('/contracts', {
      method: 'POST',
      body: '{not json',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test',
      },
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      code: 'CONTRACT_BODY_INVALID',
    });
    expect(service.create).not.toHaveBeenCalled();

    const badId = await router.request('/contracts/not-a-number', {
      method: 'PUT',
      body: '{}',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test',
      },
    });
    expect(badId.status).toBe(400);
    expect(await badId.json()).toMatchObject({ code: 'CONTRACT_ID_INVALID' });
  });

  it('surfaces a business error with its status', async () => {
    const service = {
      create: vi
        .fn()
        .mockRejectedValue(
          new ContractError('CONTRACT_NAME_REQUIRED', '合同名称不能为空。'),
        ),
    };
    const router = await createRouter(service);
    const response = await router.request('/contracts', {
      method: 'POST',
      body: '{}',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test',
      },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'CONTRACT_NAME_REQUIRED',
    });
  });
});

describe('contract attachment content', () => {
  it('streams inline and as a download when requested', async () => {
    const record = {
      id: '20000000-0000-4000-8000-000000000001',
      disk: 'local',
      key: 'objects/note.txt',
      filename: 'note.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 5,
      createdAt: '2026-09-13T00:00:00.000',
      updatedAt: '2026-09-13T00:00:00.000',
    };
    const service = { findFileRecord: vi.fn().mockResolvedValue(record) };
    const drive = {
      // Mirror of the drive manager's `use(disk)` contract.
      // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
      use: () => ({
        exists: async () => true,
        getStream: async () => Readable.from([Buffer.from('hello')]),
      }),
    };
    const router = await createRouter(service, drive);

    const inline = await router.request(
      `/contracts/attachments/${record.id}/content`,
      { headers: { authorization: 'Bearer test' } },
    );
    expect(inline.status).toBe(200);
    expect(inline.headers.get('content-type')).toBe('text/plain');
    expect(inline.headers.get('content-disposition')).toContain('inline');
    expect(await inline.text()).toBe('hello');

    const download = await router.request(
      `/contracts/attachments/${record.id}/content?download=1`,
      { headers: { authorization: 'Bearer test' } },
    );
    expect(download.headers.get('content-disposition')).toContain('attachment');
  });

  it('returns 404 for a missing record without touching the drive', async () => {
    const service = { findFileRecord: vi.fn().mockResolvedValue(null) };
    const drive = { use: vi.fn() };
    const router = await createRouter(service, drive);
    const response = await router.request(
      '/contracts/attachments/20000000-0000-4000-8000-000000000002/content',
      { headers: { authorization: 'Bearer test' } },
    );
    expect(response.status).toBe(404);
    expect(drive.use).not.toHaveBeenCalled();
  });
});
