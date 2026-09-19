// @vitest-environment node
// Hono parses multipart bodies through the fetch `Response.formData()`, which
// needs Node's undici primitives; jsdom's FormData/File are not compatible.
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { BusinessError } from '../../server/providers/inspection-service.js';
import {
  MAX_UPLOAD_FILES,
  parseUploadedFiles,
} from '../../server/routes/upload-files.js';

/**
 * Mounts the real helper on a Hono route so the request flows through Hono's
 * multipart parser exactly as it does in the application route. The error
 * handler mirrors the route's, turning a BusinessError into its status.
 */
function uploadApp(maxFiles = MAX_UPLOAD_FILES) {
  const app = new Hono();
  app.onError((error, context) => {
    if (error instanceof BusinessError) {
      return context.json(
        { code: error.code, message: error.message },
        error.status as 400,
      );
    }
    return context.json({ message: (error as Error).message }, 500);
  });
  app.post('/upload', async (context) => {
    const files = await parseUploadedFiles(context.req, { maxFiles });
    return context.json({ names: files.map((file) => file.name) });
  });
  return app;
}

function formOf(entries: readonly [name: string, size: number][]) {
  const body = new FormData();
  for (const [name, size] of entries) {
    body.append('files', new File([new Uint8Array(size)], name));
  }
  return body;
}

describe('parseUploadedFiles', () => {
  it('keeps every file selected in one batch under the same field name', async () => {
    const app = uploadApp();
    const response = await app.request('/upload', {
      method: 'POST',
      body: formOf([
        ['photo-a.png', 16],
        ['photo-b.png', 16],
        ['manual.pdf', 16],
        ['photo-c.png', 16],
      ]),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      names: ['photo-a.png', 'photo-b.png', 'manual.pdf', 'photo-c.png'],
    });
  });

  it('accepts a batch of exactly the maximum number of files', async () => {
    const app = uploadApp();
    const response = await app.request('/upload', {
      method: 'POST',
      body: formOf(
        Array.from(
          { length: MAX_UPLOAD_FILES },
          (_, index) => [`file-${index}.png`, 16] as [string, number],
        ),
      ),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { names: string[] };
    expect(payload.names).toHaveLength(MAX_UPLOAD_FILES);
  });

  it('rejects a request without files', async () => {
    const app = uploadApp();
    const response = await app.request('/upload', {
      method: 'POST',
      body: new FormData(),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('rejects a batch larger than the maximum', async () => {
    const app = uploadApp();
    const response = await app.request('/upload', {
      method: 'POST',
      body: formOf(
        Array.from(
          { length: MAX_UPLOAD_FILES + 1 },
          (_, index) => [`file-${index}.png`, 16] as [string, number],
        ),
      ),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { message: string };
    expect(payload.message).toContain(String(MAX_UPLOAD_FILES));
  });

  it('rejects a file larger than 5 MB', async () => {
    const app = uploadApp();
    const response = await app.request('/upload', {
      method: 'POST',
      body: formOf([['oversize.png', 6 * 1024 * 1024]]),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { message: string };
    expect(payload.message).toContain('5 MB');
  });
});
