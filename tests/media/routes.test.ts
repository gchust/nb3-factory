// @vitest-environment node
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { ServiceContainer } from '@nocobase/service-provider';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { MAX_UPLOAD_BYTES } from '../../server/media/allowed-types.js';
import {
  mediaServiceToken,
  type MediaAccess,
  type MediaAssetDto,
  type MediaService,
} from '../../server/media/service.js';
import {
  createMediaApiRouter,
  createMediaContentRouter,
} from '../../server/routes/media.js';

const ANONYMOUS: MediaAccess = {
  authenticated: false,
  isAdmin: false,
  isManager: false,
  isGuest: false,
  canManage: false,
  canDownload: false,
};
const GUEST: MediaAccess = {
  authenticated: true,
  isAdmin: false,
  isManager: false,
  isGuest: true,
  canManage: false,
  canDownload: false,
};
const MEMBER: MediaAccess = {
  authenticated: true,
  isAdmin: false,
  isManager: false,
  isGuest: false,
  canManage: false,
  canDownload: true,
};
const MANAGER: MediaAccess = {
  authenticated: true,
  isAdmin: false,
  isManager: true,
  isGuest: false,
  canManage: true,
  canDownload: true,
};

const FILE_ID = '11111111-1111-1111-1111-111111111111';

function accessFor(userId: string | undefined): MediaAccess {
  switch (userId) {
    case 'manager':
    case 'admin':
      return MANAGER;
    case 'guest':
      return GUEST;
    case 'user':
      return MEMBER;
    default:
      return ANONYMOUS;
  }
}

function makeAsset(overrides: Partial<MediaAssetDto> = {}): MediaAssetDto {
  return {
    id: '1',
    name: 'Launch photo',
    type: 'image',
    tags: ['launch'],
    status: 'available',
    fileId: FILE_ID,
    filename: 'photo.png',
    mimeType: 'image/png',
    ext: 'png',
    size: 12,
    uploaderId: 'manager',
    uploaderName: 'manager',
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    contentUrl: `/main/uploads/media/${FILE_ID}.png`,
    ...overrides,
  };
}

interface UploadCall {
  filename: string;
}

class FakeMedia {
  readonly uploads: UploadCall[] = [];
  readonly writes: string[] = [];

  async resolveAccess(userId: string | undefined): Promise<MediaAccess> {
    return accessFor(userId);
  }

  async listAssets(
    _input: unknown,
    access: MediaAccess,
  ): Promise<{
    items: MediaAssetDto[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const items = [
      access.canManage
        ? makeAsset({ id: '2', name: 'hidden', status: 'disabled' })
        : undefined,
      makeAsset(),
    ].filter((value): value is MediaAssetDto => value !== undefined);
    return { items, total: items.length, page: 1, pageSize: 24 };
  }

  async getAsset(
    id: string,
    access: MediaAccess,
  ): Promise<MediaAssetDto | undefined> {
    if (id === '2' && !access.canManage) return undefined;
    return id === '2'
      ? makeAsset({ id: '2', status: 'disabled' })
      : makeAsset();
  }

  async assetStatusForFile(
    fileId: string,
  ): Promise<'available' | 'disabled' | undefined> {
    if (fileId !== FILE_ID) return undefined;
    return this.disabledFile ? 'disabled' : 'available';
  }

  disabledFile = false;

  async findFile(fileId: string): Promise<
    | {
        id: string;
        disk: string;
        key: string;
        filename: string;
        ext: string;
        mimeType: string;
        size: number;
      }
    | undefined
  > {
    if (fileId !== FILE_ID) return undefined;
    return {
      id: FILE_ID,
      disk: 'local',
      key: 'objects/photo.png',
      filename: 'photo.png',
      ext: 'png',
      mimeType: 'image/png',
      size: 5,
    };
  }

  async createAsset(): Promise<MediaAssetDto> {
    return makeAsset({ id: '3', name: 'Created' });
  }

  async updateAsset(id: string): Promise<MediaAssetDto | undefined> {
    return id === 'missing' ? undefined : makeAsset({ name: 'Updated' });
  }

  async stats(): Promise<{
    items: unknown[];
    totalCount: number;
    totalSize: number;
  }> {
    return { items: [], totalCount: 0, totalSize: 0 };
  }
}

class FakeFileRepositoryManager {
  constructor(private readonly media: FakeMedia) {}

  repository(): {
    uploadOne(input: { file: File }): Promise<{
      record: Record<string, unknown>;
      createdTargets: unknown[];
    }>;
  } {
    return {
      uploadOne: async ({ file }) => {
        this.media.uploads.push({ filename: file.name });
        return {
          record: {
            id: FILE_ID,
            disk: 'local',
            key: 'objects/photo.png',
            filename: file.name,
            ext: 'png',
            mimeType: file.type,
            size: file.size,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            contentUrl: `/uploads/media/${FILE_ID}.png`,
          },
          createdTargets: [],
        };
      },
    };
  }
}

// The drive manager's only method used here is `use(disk)`. A proxy keeps the fake from
// declaring a `use`-prefixed function, which the React lint rules would take for a hook.
const fakeDrive = new Proxy(
  {},
  {
    get: () => () => ({
      exists: async () => true,
      getStream: async () => Readable.from([Buffer.from('hello')]),
    }),
  },
);

function createApp(): {
  app: Application;
  media: FakeMedia;
} {
  const media = new FakeMedia();
  const container = new ServiceContainer();
  const fakeAuth = {
    required: () => async (context: any, next: any) => {
      const userId = context.req.header('x-test-user');
      if (!userId) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }
      context.set('auth', {
        user: { id: userId, name: userId },
        session: { id: 'session' },
      });
      await next();
    },
  };
  container.instance(authenticationToken, fakeAuth as unknown as Auth);
  container.instance(mediaServiceToken, media as unknown as MediaService);
  container.instance(
    serverFileRepositoryManagerToken,
    new FakeFileRepositoryManager(media) as never,
  );
  container.instance(driveManagerToken, fakeDrive as never);
  const app = { container, publicBasePath: '/main' } as unknown as Application;
  return { app, media };
}

describe('media API routes', () => {
  it('rejects an anonymous list request', async () => {
    const { app } = createApp();
    const router = createMediaApiRouter(app);
    const response = await router.request('/media/assets');
    expect(response.status).toBe(401);
  });

  it('returns the caller access flags', async () => {
    const { app } = createApp();
    const router = createMediaApiRouter(app);
    const response = await router.request('/media/access', {
      headers: { 'x-test-user': 'guest' },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: MediaAccess };
    expect(body.data.isGuest).toBe(true);
    expect(body.data.canDownload).toBe(false);
  });

  it('hides disabled assets from an ordinary user', async () => {
    const { app } = createApp();
    const router = createMediaApiRouter(app);
    const list = (await (
      await router.request('/media/assets', {
        headers: { 'x-test-user': 'user' },
      })
    ).json()) as { data: { items: MediaAssetDto[] } };
    expect(list.data.items.map((item) => item.status)).toEqual(['available']);

    const hidden = await router.request('/media/assets/2', {
      headers: { 'x-test-user': 'user' },
    });
    expect(hidden.status).toBe(404);
  });

  it('shows a disabled asset to a media manager', async () => {
    const { app } = createApp();
    const router = createMediaApiRouter(app);
    const response = await router.request('/media/assets/2', {
      headers: { 'x-test-user': 'manager' },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: MediaAssetDto };
    expect(body.data.status).toBe('disabled');
  });

  it('refuses an ordinary user creating an asset', async () => {
    const { app } = createApp();
    const router = createMediaApiRouter(app);
    const response = await router.request('/media/assets', {
      method: 'POST',
      headers: { 'x-test-user': 'user', 'content-type': 'application/json' },
      body: JSON.stringify({ fileId: FILE_ID, name: 'x' }),
    });
    expect(response.status).toBe(403);
  });

  it('lets a media manager create an asset', async () => {
    const { app } = createApp();
    const router = createMediaApiRouter(app);
    const response = await router.request('/media/assets', {
      method: 'POST',
      headers: { 'x-test-user': 'manager', 'content-type': 'application/json' },
      body: JSON.stringify({ fileId: FILE_ID, name: 'x' }),
    });
    expect(response.status).toBe(201);
  });

  it('refuses an ordinary user editing an asset', async () => {
    const { app } = createApp();
    const router = createMediaApiRouter(app);
    const response = await router.request('/media/assets/1', {
      method: 'PATCH',
      headers: { 'x-test-user': 'user', 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'disabled' }),
    });
    expect(response.status).toBe(403);
  });

  it('requires authentication for the upload endpoint', async () => {
    const { app } = createApp();
    const router = createMediaApiRouter(app);
    const response = await router.request('/mediaFiles:uploadOne', {
      method: 'POST',
      body: new FormData(),
    });
    expect(response.status).toBe(401);
  });

  it('refuses an upload from an ordinary user', async () => {
    const { app } = createApp();
    const router = createMediaApiRouter(app);
    const form = new FormData();
    form.append(
      'file',
      new File(['hello'], 'photo.png', { type: 'image/png' }),
    );
    const response = await router.request('/mediaFiles:uploadOne', {
      method: 'POST',
      headers: { 'x-test-user': 'user' },
      body: form,
    });
    expect(response.status).toBe(403);
  });

  it('uploads an allowed file and records its content URL', async () => {
    const { app, media } = createApp();
    const router = createMediaApiRouter(app);
    const form = new FormData();
    form.append(
      'file',
      new File(['hello'], 'photo.png', { type: 'image/png' }),
    );
    const response = await router.request('/mediaFiles:uploadOne', {
      method: 'POST',
      headers: { 'x-test-user': 'manager' },
      body: form,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { record: { contentUrl: string } };
    };
    expect(body.data.record.contentUrl).toBe(
      `/main/uploads/media/${FILE_ID}.png`,
    );
    expect(media.uploads).toEqual([{ filename: 'photo.png' }]);
  });

  it('refuses a dangerous type without storing anything', async () => {
    const { app, media } = createApp();
    const router = createMediaApiRouter(app);
    for (const name of ['page.html', 'vector.svg', 'data.xml']) {
      const form = new FormData();
      form.append('file', new File(['<html></html>'], name));
      const response = await router.request('/mediaFiles:uploadOne', {
        method: 'POST',
        headers: { 'x-test-user': 'manager' },
        body: form,
      });
      expect(response.status, `${name} must be refused`).toBe(400);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe('TYPE_NOT_ALLOWED');
    }
    expect(media.uploads).toEqual([]);
  });

  it('refuses a file over the size limit without storing anything', async () => {
    const { app, media } = createApp();
    const router = createMediaApiRouter(app);
    const form = new FormData();
    form.append(
      'file',
      new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'big.png', {
        type: 'image/png',
      }),
    );
    const response = await router.request('/mediaFiles:uploadOne', {
      method: 'POST',
      headers: { 'x-test-user': 'manager' },
      body: form,
    });
    expect(response.status).toBe(413);
    expect(media.uploads).toEqual([]);
  });

  it('returns grouped statistics', async () => {
    const { app } = createApp();
    const router = createMediaApiRouter(app);
    const response = await router.request('/media/stats', {
      headers: { 'x-test-user': 'user' },
    });
    expect(response.status).toBe(200);
  });
});

describe('media content routes', () => {
  it('rejects an anonymous content request', async () => {
    const { app } = createApp();
    const router = createMediaContentRouter(app);
    const response = await router.request(`/uploads/media/${FILE_ID}.png`);
    expect(response.status).toBe(401);
  });

  it('refuses a guest', async () => {
    const { app } = createApp();
    const router = createMediaContentRouter(app);
    const response = await router.request(`/uploads/media/${FILE_ID}.png`, {
      headers: { 'x-test-user': 'guest' },
    });
    expect(response.status).toBe(403);
  });

  it('serves an available file to a normal user', async () => {
    const { app } = createApp();
    const router = createMediaContentRouter(app);
    const response = await router.request(`/uploads/media/${FILE_ID}.png`, {
      headers: { 'x-test-user': 'user' },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello');
  });

  it('refuses a disabled file opened directly by a normal user', async () => {
    const { app, media } = createApp();
    media.disabledFile = true;
    const router = createMediaContentRouter(app);
    const response = await router.request(`/uploads/media/${FILE_ID}.png`, {
      headers: { 'x-test-user': 'user' },
    });
    expect(response.status).toBe(403);
  });

  it('serves a disabled file to a media manager', async () => {
    const { app, media } = createApp();
    media.disabledFile = true;
    const router = createMediaContentRouter(app);
    const response = await router.request(`/uploads/media/${FILE_ID}.png`, {
      headers: { 'x-test-user': 'manager' },
    });
    expect(response.status).toBe(200);
  });
});
