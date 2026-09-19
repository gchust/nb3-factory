// @vitest-environment node
import type { Application } from '@nocobase/app-server/application';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { MAX_FILE_SIZE } from '../../server/providers/delivery-service.js';
import { deliveryFileApiRoutes } from '../../server/routes/files.js';
import {
  MAX_UPLOAD_BODY_SIZE,
  MAX_UPLOAD_OVERHEAD,
  uploadBodyLimit,
} from '../../server/routes/files.js';

function multipartBody(bytes: number): FormData {
  const form = new FormData();
  form.append(
    'file',
    new File([new Uint8Array(bytes)], 'clip.txt', { type: 'text/plain' }),
  );
  return form;
}

/**
 * Mounts the real upload contribution with a stub file repository, so the
 * request passes through both the application body limit and the one the file
 * plugin installs from the contribution's `uploadOne.maxSize`.
 */
function createUploadHarness(): {
  readonly router: Awaited<
    ReturnType<typeof deliveryFileApiRoutes.createRouter>
  >;
  readonly uploadOne: ReturnType<typeof vi.fn>;
} {
  const uploadOne = vi.fn(async ({ file }: { file: File }) => ({
    id: '11111111-1111-1111-1111-111111111111',
    filename: file.name,
    ext: 'txt',
    mimeType: file.type,
    size: file.size,
  }));
  const repository = {
    validateCollection: async () => undefined,
    getUrl: () => '/uploads/delivery-files/stub',
    uploadOne,
  };
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => async (context: never, next: () => Promise<void>) => {
      await next();
    },
  });
  container.instance(serverFileRepositoryManagerToken, {
    repository: () => repository,
  });

  return {
    router: deliveryFileApiRoutes.createRouter({
      container,
      publicBasePath: '/main',
    } as unknown as Application),
    uploadOne,
  };
}

/**
 * The upload action applies its `maxSize` to the whole multipart request, not
 * to the file inside it. A body limit equal to the per-file limit therefore
 * rejected a file of exactly that size because its framing pushed the body
 * over — the 5 MiB upload failure. These tests pin the relationship that
 * keeps a full-size file inside the transport limit.
 */
describe('delivery upload transport limit', () => {
  it('accepts a file at the business limit through the real upload route', async () => {
    const { router, uploadOne } = createUploadHarness();
    const response = await (
      await router
    ).request('/deliveryFiles:uploadOne', {
      method: 'POST',
      body: multipartBody(MAX_FILE_SIZE),
    });

    expect(response.status).toBe(200);
    expect(uploadOne).toHaveBeenCalledTimes(1);
    const uploaded = uploadOne.mock.calls[0][0] as { file: File };
    expect(uploaded.file.size).toBe(MAX_FILE_SIZE);
  });

  it('fits a file at the business limit, framing included, into the body limit', async () => {
    const body = await new Response(multipartBody(MAX_FILE_SIZE)).arrayBuffer();

    // Multipart framing is real overhead, so the body is strictly larger than
    // the file, and the configured limit has to accommodate that body.
    expect(body.byteLength).toBeGreaterThan(MAX_FILE_SIZE);
    expect(MAX_UPLOAD_BODY_SIZE).toBeGreaterThan(body.byteLength);
  });

  it('reserves headroom above the per-file limit', () => {
    expect(MAX_UPLOAD_OVERHEAD).toBeGreaterThan(0);
    expect(MAX_UPLOAD_BODY_SIZE).toBe(MAX_FILE_SIZE + MAX_UPLOAD_OVERHEAD);
  });

  it('answers a body past the transport limit with a localized 413', async () => {
    const { router } = createUploadHarness();
    const response = await (
      await router
    ).request('/deliveryFiles:uploadOne', {
      method: 'POST',
      body: multipartBody(MAX_FILE_SIZE + MAX_UPLOAD_OVERHEAD + 4096),
    });
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: 'FILE_TOO_LARGE',
      message: '文件超过 5 MB 限制。',
    });
  });

  it('answers the body limit middleware with a localized 413', async () => {
    const app = new Hono();
    app.use('/upload', uploadBodyLimit);
    app.post('/upload', (context) => context.text('ok'));

    const rejected = await app.request('/upload', {
      method: 'POST',
      body: new Uint8Array(MAX_UPLOAD_BODY_SIZE + 1),
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
    });
    expect(rejected.status).toBe(413);
    await expect(rejected.json()).resolves.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
  });
});
