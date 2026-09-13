// @vitest-environment node
// The Drive manager's public method is named `use`, which the hooks lint rule mistakes for a
// React hook on the test doubles below.
/* eslint-disable @eslint-react/no-unnecessary-use-prefix */
import { Readable } from 'node:stream';

import { databaseManagerToken } from '@nocobase/db';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';
import { Hono, type MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { resourceCenterServiceToken } from '../../server/providers/resource-center.js';
import { resourceCenterRoutes } from '../../server/routes/resource-center.js';
import resourceFileRoutes from '../../server/routes/resource-files.js';

function provide<T>(
  container: ServiceContainer,
  token: ServiceToken<T>,
  value: unknown,
): void {
  container.instance(token, value as T);
}

function rejectingAuth(): { required(): MiddlewareHandler } {
  return {
    required: () => async (context) =>
      context.json({ code: 'UNAUTHENTICATED' }, 401),
  };
}

function allowingAuth(): { required(): MiddlewareHandler } {
  return {
    required: () => async (_context, next) => {
      await next();
    },
  };
}

interface MockApp {
  readonly container: ServiceContainer;
  readonly publicBasePath: string;
}

function fileApp(options: {
  readonly auth: 'allow' | 'reject';
  readonly files?: Record<string, unknown>;
}): MockApp {
  const container = new ServiceContainer();
  provide(
    container,
    authenticationToken,
    options.auth === 'allow' ? allowingAuth() : rejectingAuth(),
  );
  provide(container, serverFileRepositoryManagerToken, {
    repository: () => options.files ?? {},
  });
  provide(container, databaseManagerToken, { repository: () => ({}) });
  provide(container, driveManagerToken, {
    use: () => ({ exists: async () => true }),
  });
  return { container, publicBasePath: '/main' };
}

async function createRouters(app: MockApp): Promise<readonly Hono[]> {
  return Promise.all(
    resourceFileRoutes.map((contribution) =>
      contribution.createRouter(app as unknown as Application),
    ),
  );
}

describe('resource file routes', () => {
  it('rejects anonymous uploads and metadata reads', async () => {
    const app = fileApp({ auth: 'reject' });
    const [api, root] = await createRouters(app);
    if (!api || !root) throw new Error('Expected both file routers.');

    const list = await api.request('/resource-files');
    expect(list.status).toBe(401);

    const upload = await api.request('/resource-files/upload', {
      method: 'POST',
      body: new FormData(),
    });
    expect(upload.status).toBe(401);

    const content = await root.request(
      '/uploads/resource-files/00000000-0000-0000-0000-000000000000.png',
    );
    expect(content.status).toBe(401);
  });

  it('lists and serves metadata with a signed-in session', async () => {
    const record = {
      id: '11111111-1111-1111-1111-111111111111',
      disk: 'local',
      key: 'objects/a.pdf',
      filename: 'handbook.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      size: 12,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const files = {
      findMany: vi.fn(async () => [record]),
      getUrl: (file: { id: string; ext: string }) =>
        `/uploads/resource-files/${file.id}.${file.ext}`,
    };
    const app = fileApp({ auth: 'allow', files });
    const [api] = await createRouters(app);
    if (!api) throw new Error('Expected the file API router.');

    const response = await api.request('/resource-files');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { filename: string; size: number; contentUrl: string }[];
    };
    expect(body.data[0]?.filename).toBe('handbook.pdf');
    expect(body.data[0]?.size).toBe(12);
    expect(body.data[0]?.contentUrl).toBe(
      '/main/uploads/resource-files/11111111-1111-1111-1111-111111111111.pdf',
    );
  });

  it('streams the stored bytes for a signed-in session', async () => {
    const record = {
      id: '22222222-2222-2222-2222-222222222222',
      disk: 'local',
      key: 'objects/b.txt',
      filename: 'notes.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const files = {
      findOne: vi.fn(async () => record),
      getUrl: () => '/uploads/resource-files/placeholder',
    };
    const container = new ServiceContainer();
    provide(container, authenticationToken, allowingAuth());
    provide(container, serverFileRepositoryManagerToken, {
      repository: () => files,
    });
    provide(container, databaseManagerToken, { repository: () => ({}) });
    provide(container, driveManagerToken, {
      use: () => ({
        exists: async () => true,
        getStream: async () => Readable.from([Buffer.from('hello')]),
      }),
    });

    const [, root] = await createRouters({
      container,
      publicBasePath: '/main',
    });
    if (!root) throw new Error('Expected the content router.');

    const response = await root.request(
      '/uploads/resource-files/22222222-2222-2222-2222-222222222222.txt',
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello');
    expect(response.headers.get('content-type')).toBe('text/plain');
  });

  it('does not let the file middleware leak into sibling routes', async () => {
    const app = fileApp({ auth: 'reject' });
    const [api, root] = await createRouters(app);
    if (!api || !root) throw new Error('Expected both file routers.');

    const sibling = defineApiRoutes(() => {
      const router = new Hono();
      router.get('/other', (context) => context.text('ok'));
      return router;
    });

    const parent = new Hono();
    parent.route('/api', api);
    parent.route(
      '/api',
      await sibling.createRouter(app as unknown as Application),
    );
    parent.route('/', root);

    // Anonymous uploads are rejected...
    expect((await parent.request('/api/resource-files')).status).toBe(401);
    // ...but an unrelated contribution mounted at the same prefix is untouched.
    expect((await parent.request('/api/other')).status).toBe(200);
  });
});

describe('resource centre routes', () => {
  it('rejects anonymous requests', async () => {
    const container = new ServiceContainer();
    provide(container, authenticationToken, rejectingAuth());
    provide(container, resourceCenterServiceToken, {});
    const router = await resourceCenterRoutes.createRouter({
      container,
      publicBasePath: '/main',
    } as unknown as Application);

    const response = await router.request('/resources');
    expect(response.status).toBe(401);
  });

  it('returns resources with a public-session-relative cover URL', async () => {
    const container = new ServiceContainer();
    provide(container, authenticationToken, allowingAuth());
    provide(container, resourceCenterServiceToken, {
      list: async () => [
        {
          id: 1,
          title: 'Employee Handbook',
          category: 'Policy',
          cover: {
            id: '33333333-3333-3333-3333-333333333333',
            filename: 'cover.png',
            ext: 'png',
            mimeType: 'image/png',
            size: 10,
            contentPath: '/uploads/resource-files/cover.png',
          },
          document: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      get: async () => undefined,
      create: async () => {
        throw new Error('not used');
      },
    });
    const router = await resourceCenterRoutes.createRouter({
      container,
      publicBasePath: '/main',
    } as unknown as Application);

    const response = await router.request('/resources');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { cover: { contentUrl: string } }[];
    };
    expect(body.data[0]?.cover.contentUrl).toBe(
      '/main/uploads/resource-files/cover.png',
    );
  });

  it('validates the create payload before touching the service', async () => {
    const container = new ServiceContainer();
    provide(container, authenticationToken, allowingAuth());
    const create = vi.fn(
      async (input: { readonly title: string; readonly category: string }) => ({
        id: 5,
        title: input.title,
        category: input.category,
        cover: null,
        document: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    provide(container, resourceCenterServiceToken, {
      list: async () => [],
      get: async () => undefined,
      create,
    });
    const router = await resourceCenterRoutes.createRouter({
      container,
      publicBasePath: '/main',
    } as unknown as Application);

    const response = await router.request('/resources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ', category: 'Policy' }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe(
      'INVALID_TITLE',
    );
    expect(create).not.toHaveBeenCalled();

    const created = await router.request('/resources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Handbook',
        category: 'Policy',
        coverFileId: null,
        documentFileId: null,
      }),
    });
    expect(created.status).toBe(201);
    expect(create).toHaveBeenCalledWith({
      title: 'Handbook',
      category: 'Policy',
      coverFileId: null,
      documentFileId: null,
    });
  });
});
