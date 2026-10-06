// @vitest-environment node
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { databaseManagerToken } from '@nocobase/db';
import type { Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const sourceRoot = path.resolve(import.meta.dirname, '../..');
const fixtures = path.join(sourceRoot, 'tests/fixtures/project-materials');

interface TestAttachment {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly contentUrl: string;
  readonly materialId?: string | null;
}

interface TestMaterial {
  readonly id: string;
  readonly title: string;
  readonly attachments: readonly TestAttachment[];
}

let server: StandaloneServer;
let baseUrl: string;
let tempDir: string;
let ownerCookie: string;
let colleagueCookie: string;

beforeAll(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'nocobase-project-materials-'));
  const databaseDir = path.join(tempDir, 'database');
  const storageDir = path.join(tempDir, 'storage');

  const configFile = path.join(tempDir, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      app: { publicOrigin: 'http://localhost' },
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(databaseDir, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );

  server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: configFile,
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir,
    },
  });
  baseUrl = `http://localhost${server.application.publicBasePath}`;
  ownerCookie = await createAccount('materialowner', '材料员甲');
  colleagueCookie = await createAccount('materialcolleague', '同事乙');
});

afterAll(async () => {
  await server?.close();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

function request(
  path: string,
  init: RequestInit = {},
): Response | Promise<Response> {
  const url = `${baseUrl}${path}`;
  const headers = new Headers(init.headers);
  // A browser sends Origin on every same-origin non-GET; better-auth's cookie
  // write guard rejects the request without it.
  if (!headers.has('origin')) headers.set('origin', new URL(url).origin);
  return server.fetch(new Request(url, { ...init, headers }));
}

async function createAccount(username: string, name: string): Promise<string> {
  const password = 'correct-horse-battery-staple';
  const signUp = await request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      name,
      email: `${username}@example.com`,
      password,
    }),
  });
  expect(signUp.status).toBe(200);

  const signIn = await request('/api/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  expect(signIn.status).toBe(200);
  return signIn.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

async function uploadBytes(
  cookie: string | undefined,
  filename: string,
  bytes: Uint8Array,
): Promise<TestAttachment> {
  const extension = filename.includes('.')
    ? filename.split('.').pop()!.toLowerCase()
    : '';
  const form = new FormData();
  form.set(
    'file',
    new File([bytes], filename, {
      type: MIME_TYPES[extension] ?? 'application/octet-stream',
    }),
  );
  const response = await request('/api/projectMaterialAttachments/upload', {
    method: 'POST',
    headers: cookie ? { cookie } : undefined,
    body: form,
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: { record: TestAttachment };
  };
  return body.data.record;
}

async function upload(
  cookie: string | undefined,
  fixture: string,
): Promise<TestAttachment> {
  return uploadBytes(
    cookie,
    fixture,
    readFileSync(path.join(fixtures, fixture)),
  );
}

async function createMaterial(
  cookie: string,
  title: string,
  attachmentIds: readonly string[],
): Promise<TestMaterial> {
  const response = await request('/api/projectMaterials', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ title, attachmentIds }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: TestMaterial }).data;
}

async function updateMaterial(
  cookie: string,
  materialId: string,
  title: string,
  attachmentIds: readonly string[],
): Promise<TestMaterial> {
  const response = await request(`/api/projectMaterials/${materialId}`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ title, attachmentIds }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: TestMaterial }).data;
}

describe('project materials API', () => {
  it('applies the migration to a real database', async () => {
    const database = server.application.container.resolve(databaseManagerToken);
    const client = await database.connection('main').client<Knex>();
    const tables = await client('sqlite_master')
      .where({ type: 'table' })
      .pluck('name');
    expect(tables).toContain('project_materials');
    expect(tables).toContain('project_material_attachments');
  });

  it('rejects anonymous callers on every owned endpoint', async () => {
    expect((await request('/api/projectMaterials')).status).toBe(401);
    expect(
      (
        await request(
          '/api/projectMaterials/00000000-0000-0000-0000-000000000000',
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'x', attachmentIds: [] }),
          },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          '/api/projectMaterialFiles/00000000-0000-0000-0000-000000000000/content',
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request('/api/projectMaterialAttachments/upload', {
          method: 'POST',
          body: new FormData(),
        })
      ).status,
    ).toBe(401);
  });

  it('keeps a material and its files private to their owner', async () => {
    const attachment = await upload(ownerCookie, 'photo.png');
    const material = await createMaterial(ownerCookie, '桥梁工程资料', [
      attachment.id,
    ]);
    expect(material.attachments).toHaveLength(1);
    expect(material.attachments[0]?.id).toBe(attachment.id);

    // The owner sees it.
    const ownedList = (await (
      await request('/api/projectMaterials', {
        headers: { cookie: ownerCookie },
      })
    ).json()) as { data: TestMaterial[] };
    expect(ownedList.data.map((item) => item.id)).toContain(material.id);

    const ownedDetail = await request(`/api/projectMaterials/${material.id}`, {
      headers: { cookie: ownerCookie },
    });
    expect(ownedDetail.status).toBe(200);
    await expect(ownedDetail.json()).resolves.toMatchObject({
      data: { id: material.id, title: '桥梁工程资料' },
    });

    // A signed-in colleague with the exact ids gets the same 404 an unknown id gets.
    const colleagueList = (await (
      await request('/api/projectMaterials', {
        headers: { cookie: colleagueCookie },
      })
    ).json()) as { data: TestMaterial[] };
    expect(colleagueList.data.map((item) => item.id)).not.toContain(
      material.id,
    );

    expect(
      (
        await request(`/api/projectMaterials/${material.id}`, {
          headers: { cookie: colleagueCookie },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/projectMaterialFiles/${attachment.id}/content`, {
          headers: { cookie: colleagueCookie },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/projectMaterials/${material.id}`, {
          method: 'PATCH',
          headers: {
            cookie: colleagueCookie,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ title: 'hijacked', attachmentIds: [] }),
        })
      ).status,
    ).toBe(404);

    // The owner can fetch the bytes; the response is a private, non-sniffable stream.
    const content = await request(
      `/api/projectMaterialFiles/${attachment.id}/content`,
      { headers: { cookie: ownerCookie } },
    );
    expect(content.status).toBe(200);
    expect(content.headers.get('cache-control')).toBe('private, no-store');
    expect(content.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await content.arrayBuffer())).toEqual(
      readFileSync(path.join(fixtures, 'photo.png')),
    );

    // The draft upload is not attributed to any material until a save links it.
    const draft = await upload(ownerCookie, 'corrupted.png');
    expect(draft.materialId).toBeNull();
    const draftContent = await request(
      `/api/projectMaterialFiles/${draft.id}/content`,
      { headers: { cookie: ownerCookie } },
    );
    expect(draftContent.status).toBe(200);
    expect(Buffer.from(await draftContent.arrayBuffer())).toEqual(
      readFileSync(path.join(fixtures, 'corrupted.png')),
    );
  });

  it('lets a draft upload survive a failed save without re-uploading', async () => {
    const attachment = await upload(ownerCookie, 'notes.docx');

    const missingTitle = await request('/api/projectMaterials', {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ', attachmentIds: [attachment.id] }),
    });
    expect(missingTitle.status).toBe(400);
    await expect(missingTitle.json()).resolves.toMatchObject({
      code: 'TITLE_REQUIRED',
    });

    // Filling the title reuses the already-uploaded file id.
    const material = await createMaterial(ownerCookie, '施工方案', [
      attachment.id,
    ]);
    expect(material.attachments.map((item) => item.id)).toEqual([
      attachment.id,
    ]);
    const content = await request(
      `/api/projectMaterialFiles/${attachment.id}/content`,
      { headers: { cookie: ownerCookie } },
    );
    expect(content.status).toBe(200);
    expect(Buffer.from(await content.arrayBuffer())).toEqual(
      readFileSync(path.join(fixtures, 'notes.docx')),
    );
  });

  it('refuses file types outside the v1 format scope', async () => {
    const form = new FormData();
    form.set(
      'file',
      new File([new TextEncoder().encode('plain text')], 'notes.txt', {
        type: 'text/plain',
      }),
    );
    const response = await request('/api/projectMaterialAttachments/upload', {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: form,
    });
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      code: 'UNSUPPORTED_FILE_TYPE',
    });
  });

  it('unlinks a removed attachment without destroying the file', async () => {
    const attachment = await upload(ownerCookie, 'photo.png');
    const material = await createMaterial(ownerCookie, '待整理资料', [
      attachment.id,
    ]);

    const removed = await updateMaterial(
      ownerCookie,
      material.id,
      '待整理资料',
      [],
    );
    expect(removed.attachments).toEqual([]);

    // Not part of the material anymore, but the owner's upload still exists.
    const content = await request(
      `/api/projectMaterialFiles/${attachment.id}/content`,
      { headers: { cookie: ownerCookie } },
    );
    expect(content.status).toBe(200);

    // A colleague still cannot reach it.
    expect(
      (
        await request(`/api/projectMaterialFiles/${attachment.id}/content`, {
          headers: { cookie: colleagueCookie },
        })
      ).status,
    ).toBe(404);
  });
});
