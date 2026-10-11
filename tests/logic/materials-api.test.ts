// @vitest-environment node
import {
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
  generateApiDocument,
} from '@nocobase/app-server/router';
import { createTestAppConfig } from '@nocobase/app-testing/server';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const DEMO_PASSWORD = 'Materials#2026';
const SERVERS: StandaloneServer[] = [];
const CONFIGS: { dispose(): Promise<void> }[] = [];
const TEMP_DIRS: string[] = [];

afterEach(async () => {
  await Promise.all(SERVERS.splice(0).map((server) => server.close()));
  await Promise.all(CONFIGS.splice(0).map((config) => config.dispose()));
  for (const dir of TEMP_DIRS.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('materials API', () => {
  it('keeps a material and its attachments private to their owner', async () => {
    const server = await startInstalledServer();
    const base = `http://localhost${server.application.publicBasePath}`;

    // The list is not readable without a session.
    const anonymous = await requestApp(server, `${base}/api/materials`);
    expect(anonymous.status).toBe(401);

    const owner = await signIn(server, 'materials.owner');
    const ownerList = await readJson(
      await requestApp(server, `${base}/api/materials`, {
        headers: { cookie: owner },
      }),
    );
    const titles = (ownerList.data as { title: string }[]).map(
      (material) => material.title,
    );
    expect(titles).toEqual(
      expect.arrayContaining(['朝阳项目立项资料', '海淀改造验收资料']),
    );
    expect(ownerList.data).toHaveLength(2);
    const sampleMaterialId = (ownerList.data[0] as { id: number }).id;

    // A colleague owns nothing and cannot read a material by its id.
    const colleague = await signIn(server, 'materials.colleague');
    const colleagueList = await readJson(
      await requestApp(server, `${base}/api/materials`, {
        headers: { cookie: colleague },
      }),
    );
    expect(colleagueList.data).toEqual([]);
    const colleagueRead = await requestApp(
      server,
      `${base}/api/materials/${sampleMaterialId}`,
      { headers: { cookie: colleague } },
    );
    expect(colleagueRead.status).toBe(404);

    // An upload is stored under the uploader alone and exposes a content URL.
    const form = new FormData();
    form.append(
      'file',
      new File([samplePng()], 'sample.png', { type: 'image/png' }),
    );
    const upload = await requestApp(
      server,
      `${base}/api/materialFiles/uploadOne`,
      {
        method: 'POST',
        headers: writeHeaders(owner),
        body: form,
      },
    );
    expect(upload.status).toBe(201);
    const uploaded = (
      (await readJson(upload)) as { data: { record: { id: string } } }
    ).data.record;
    expect(typeof uploaded.id).toBe('string');

    const created = await requestApp(server, `${base}/api/materials`, {
      method: 'POST',
      headers: writeHeaders(owner, true),
      body: JSON.stringify({ title: '新资料', fileIds: [uploaded.id] }),
    });
    expect(created.status).toBe(200);
    const createdData = (
      (await readJson(created)) as {
        data: { id: number; files: { id: string; contentUrl: string }[] };
      }
    ).data;
    expect(createdData.files.map((file) => file.id)).toEqual([uploaded.id]);
    const contentUrl = createdData.files[0].contentUrl;
    expect(contentUrl).toContain('/uploads/materials/');

    // The bytes are refused to a stranger, to a colleague, and served to the owner.
    const anonBytes = await requestApp(server, `http://localhost${contentUrl}`);
    expect(anonBytes.status).toBe(401);
    const colleagueBytes = await requestApp(
      server,
      `http://localhost${contentUrl}`,
      { headers: { cookie: colleague } },
    );
    expect(colleagueBytes.status).toBe(404);
    const ownerBytes = await requestApp(
      server,
      `http://localhost${contentUrl}`,
      { headers: { cookie: owner } },
    );
    expect(ownerBytes.status).toBe(200);
    expect(ownerBytes.headers.get('cache-control')).toContain('no-store');
    await ownerBytes.arrayBuffer();

    // A blank title is refused before anything is written.
    const blank = await requestApp(server, `${base}/api/materials`, {
      method: 'POST',
      headers: writeHeaders(owner, true),
      body: JSON.stringify({ title: '   ', fileIds: [] }),
    });
    expect(blank.status).toBe(400);

    // Deleting detaches the attachment and leaves no material behind.
    const deleted = await requestApp(
      server,
      `${base}/api/materials/${createdData.id}`,
      { method: 'DELETE', headers: writeHeaders(owner) },
    );
    expect(deleted.status).toBe(204);
    const gone = await requestApp(
      server,
      `${base}/api/materials/${createdData.id}`,
      { headers: { cookie: owner } },
    );
    expect(gone.status).toBe(404);

    // The materials routes declare themselves: the API document has no undeclared `/api` route and no route whose
    // declared response contradicts its schema.
    expect(findUndeclaredApiRoutes(server.application)).toEqual([]);
    const document = await generateApiDocument(server.application, {
      info: { title: 'Materials test application', version: '0.0.0' },
    });
    expect(findApiDocumentSchemaProblems(document)).toEqual([]);
  }, 120_000);
});

async function startInstalledServer(): Promise<StandaloneServer> {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-materials-database-'),
  );
  const storageDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-materials-storage-'),
  );
  TEMP_DIRS.push(databaseDir, storageDir);
  mkdirSync(path.join(storageDir, 'uploads'), { recursive: true });

  const config = await createTestAppConfig({
    connections: ['main'],
    install: true,
    config: {
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: { connections: { main: { seeds: { autoRun: true } } } },
      hub: { host: { enabled: false } },
    },
  });
  CONFIGS.push(config);

  const server = await createStandaloneServer({
    env: {
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: config.path,
      // A cookie-authenticated write is only trusted from the application's own origin, and Better Auth learns that
      // origin from `APP_PUBLIC_ORIGIN`. A deployment sets it; the test states it too.
      APP_PUBLIC_ORIGIN: 'http://localhost',
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir,
    },
  });
  SERVERS.push(server);
  return server;
}

async function signIn(
  server: StandaloneServer,
  username: string,
): Promise<string> {
  const base = `http://localhost${server.application.publicBasePath}`;
  const response = await requestApp(
    server,
    `${base}/api/auth/sign-in/username`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: DEMO_PASSWORD }),
    },
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

function requestApp(
  server: StandaloneServer,
  input: Request | string | URL,
  requestInit?: RequestInit,
): Response | Promise<Response> {
  const request =
    input instanceof Request ? input : new Request(input, requestInit);
  return server.fetch(request);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/**
 * A cookie-authenticated write has to state the application's own origin; Better Auth refuses a cookie-bearing
 * write with no trusted origin as a possible cross-site forgery.
 */
function writeHeaders(cookie: string, json = false): Record<string, string> {
  return {
    cookie,
    origin: 'http://localhost',
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}

/** The smallest valid PNG: a 1×1 transparent image. */
function samplePng(): Uint8Array {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
}
