// @vitest-environment node

import { createDriveManager, type NocoBaseDriveManager } from '@nocobase/drive';
import { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import {
  authenticationToken,
  type Auth,
  type AuthEnv,
  type AuthSession,
} from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DefaultProjectDocumentService,
  projectDocumentServiceToken,
} from '../../server/providers/project-documents.js';
import { apiRoutes } from '../../server/routes/project-documents.js';

const migrationsDirectory = fileURLToPath(
  new URL('../../database/main/migrations', import.meta.url),
);

const ACCESS_PATH = '/api/project-documents/files';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/**
 * The real route factory, the real service and a real database, with only the
 * session replaced by a header. That keeps the test on the artifact's own
 * security boundary instead of a helper standing in front of it.
 */
describe('project document routes', () => {
  let directory: string;
  let database: DatabaseManager;
  let drive: NocoBaseDriveManager;
  let request: (
    path: string,
    init?: Omit<RequestInit, 'headers'> & {
      user?: string;
      headers?: HeadersInit;
    },
  ) => Promise<Response>;

  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'project-documents-routes-'));
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: sqlite({
          filename: path.join(directory, 'database.sqlite'),
          schemaManagement: 'managed',
        }),
      },
    });
    await database
      .createMigrator({
        packageName: '@app/test',
        directory: migrationsDirectory,
        connection: 'main',
      })
      .latest();
    drive = createDriveManager({
      default: 'local',
      disks: {
        local: {
          driver: 'fs',
          location: path.join(directory, 'storage'),
          visibility: 'private',
        },
      },
    });
    const service = new DefaultProjectDocumentService({
      database,
      drive,
      files: new ServerFileRepositoryManager(database, drive),
      disk: 'local',
      accessPath: ACCESS_PATH,
      contentUrl: (fileId) => `${ACCESS_PATH}/${fileId}/content`,
    });

    const auth = {
      required: (): MiddlewareHandler<AuthEnv> => async (context, next) => {
        const id = context.req.header('x-test-user');
        if (!id) {
          return context.json(
            { code: 'UNAUTHORIZED', message: 'Authentication required' },
            401,
          );
        }
        context.set('auth', {
          user: { id },
          session: {},
        } as unknown as NonNullable<AuthSession>);
        await next();
      },
    } as unknown as Auth;

    const container = new ServiceContainer();
    container.instance(authenticationToken, auth);
    container.instance(projectDocumentServiceToken, service);
    const application = {
      container,
      publicBasePath: '/main',
    } as unknown as Application;
    const router = await apiRoutes.createRouter(application);

    request = (target, init = {}) => {
      const { user, headers: given, ...rest } = init;
      const headers = new Headers(given);
      if (user) headers.set('x-test-user', user);
      return Promise.resolve(router.request(target, { ...rest, headers }));
    };
  });

  afterAll(async () => {
    await database.destroy();
    rmSync(directory, { recursive: true, force: true });
  });

  async function jsonBody<T>(response: Response): Promise<{ data: T }> {
    return (await response.json()) as { data: T };
  }

  async function uploadWithForm(
    user: string,
    name: string,
    type: string,
    bytes: Buffer = PNG_BYTES,
  ) {
    const form = new FormData();
    form.append('file', new File([bytes], name, { type }));
    return request('/project-documents/files', {
      method: 'POST',
      body: form,
      user,
    });
  }

  it('refuses an anonymous caller before any handler runs', async () => {
    for (const path of [
      '/project-documents',
      '/project-documents/files/anything/content',
    ]) {
      const response = await request(path);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    }
  });

  it('never shows one owner another owner document or its content', async () => {
    const owner = 'route-owner';
    const stranger = 'route-stranger';

    const upload = await uploadWithForm(owner, 'photo.png', 'image/png');
    expect(upload.status).toBe(200);
    const { data: file } = await jsonBody<{ id: string; contentUrl: string }>(
      upload,
    );
    expect(file.contentUrl).toBe(`${ACCESS_PATH}/${file.id}/content`);

    const created = await request('/project-documents', {
      method: 'POST',
      user: owner,
      body: JSON.stringify({ title: 'Private', fileIds: [file.id] }),
      headers: { 'content-type': 'application/json' },
    });
    expect(created.status).toBe(201);
    const { data: document } = await jsonBody<{ id: string }>(created);

    const visible = await request('/project-documents', { user: stranger });
    await expect(jsonBody(visible)).resolves.toEqual({ data: [] });

    expect(
      (await request(`/project-documents/${document.id}`, { user: stranger }))
        .status,
    ).toBe(404);
    expect(
      (
        await request(`/project-documents/files/${file.id}/content`, {
          user: stranger,
        })
      ).status,
    ).toBe(404);

    const content = await request(
      `/project-documents/files/${file.id}/content`,
      { user: owner },
    );
    expect(content.status).toBe(200);
    expect(content.headers.get('content-type')).toBe('image/png');
    expect(content.headers.get('cache-control')).toBe('private, no-store');
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(
      new Uint8Array(PNG_BYTES),
    );
  });

  it('reports a missing title as a 400 without losing the upload', async () => {
    const owner = 'route-title-owner';
    const upload = await uploadWithForm(owner, 'photo.png', 'image/png');
    const { data: file } = await jsonBody<{ id: string }>(upload);

    const rejected = await request('/project-documents', {
      method: 'POST',
      user: owner,
      body: JSON.stringify({ title: '', fileIds: [file.id] }),
      headers: { 'content-type': 'application/json' },
    });
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toMatchObject({
      code: 'INVALID_TITLE',
    });

    const saved = await request('/project-documents', {
      method: 'POST',
      user: owner,
      body: JSON.stringify({ title: 'Recovered', fileIds: [file.id] }),
      headers: { 'content-type': 'application/json' },
    });
    expect(saved.status).toBe(201);
    const { data: document } = await jsonBody<{ files: { id: string }[] }>(
      saved,
    );
    expect(document.files.map((item) => item.id)).toEqual([file.id]);
  });

  it('rejects an unsupported attachment type with a 415', async () => {
    const response = await uploadWithForm(
      'route-type-owner',
      'archive.zip',
      'application/zip',
      Buffer.from('zip'),
    );
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      code: 'UNSUPPORTED_FILE_TYPE',
    });
  });

  it('rejects a multipart body without a file with a 400', async () => {
    const form = new FormData();
    form.append('other', 'value');
    const response = await request('/project-documents/files', {
      method: 'POST',
      user: 'route-body-owner',
      body: form,
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_FILE',
    });
  });

  it('removes a document through DELETE and answers 204', async () => {
    const owner = 'route-delete-owner';
    const upload = await uploadWithForm(owner, 'notes.docx', DOCX_MIME);
    const { data: file } = await jsonBody<{ id: string }>(upload);
    const created = await request('/project-documents', {
      method: 'POST',
      user: owner,
      body: JSON.stringify({ title: 'Disposable', fileIds: [file.id] }),
      headers: { 'content-type': 'application/json' },
    });
    const { data: document } = await jsonBody<{ id: string }>(created);

    const removed = await request(`/project-documents/${document.id}`, {
      method: 'DELETE',
      user: owner,
    });
    expect(removed.status).toBe(204);
    expect(
      (
        await request(`/project-documents/files/${file.id}/content`, {
          user: owner,
        })
      ).status,
    ).toBe(404);
  });
});
