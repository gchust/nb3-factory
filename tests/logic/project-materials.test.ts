// @vitest-environment node

import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { databaseManagerToken, emptyDatabaseTaskConfig } from '@nocobase/db';

import seedDefinition from '../../database/main/seeds/202609280001_seed_project_materials.ts';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

/**
 * End-to-end check of "项目资料与私有附件" against a real SQLite database: the
 * migrations, the seed accounts, the upload exposure and the owner-only guard
 * all run here exactly as the running application composes them. The rest of
 * the feature — what the browser renders — is covered by the component tests.
 */
const ORIGIN = 'http://localhost';
const RESOURCE = 'projectMaterialFiles';
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const DOCX_BYTES = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00,
]);

interface UploadEnvelope {
  record: {
    id: string;
    ext: string;
    filename: string;
    mimeType: string;
    contentUrl: string;
  };
}

interface AttachmentPayload {
  id: string;
  filename: string;
  mimeType: string;
  contentUrl: string;
}

interface MaterialPayload {
  id: string;
  title: string;
  attachments: AttachmentPayload[];
}

let server: StandaloneServer;
let base: string;
let jiaCookie: string;
let yiCookie: string;
const tempDirs: string[] = [];

beforeAll(async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'project-materials-test-'));
  tempDirs.push(directory);
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: writeRuntimeTestConfig(directory),
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: directory,
    },
  });
  base = `http://localhost${server.application.publicBasePath}`;
  jiaCookie = await signIn('jia01');
  yiCookie = await signIn('yi01');
}, 120_000);

afterAll(async () => {
  await server?.close();
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('keeps an uploaded attachment private to its owner across a save and reload', async () => {
  const anonymousUpload = await upload(undefined, 'photo.png', 'image/png');
  expect(anonymousUpload.status).toBe(401);

  const uploaded = await uploadAs(
    jiaCookie,
    'photo.png',
    'image/png',
    PNG_BYTES,
  );
  const uploadedAttachment = uploaded.attachments[0];
  expect(uploadedAttachment.filename).toBe('photo.png');

  // A second signed-in account cannot read the bytes even with the exact URL.
  const forbidden = await requestApp(uploadedAttachment.contentUrl, {
    headers: { cookie: yiCookie },
  });
  expect(forbidden.status).toBe(404);
  const anonymous = await requestApp(uploadedAttachment.contentUrl);
  expect(anonymous.status).toBe(401);

  // Saving attaches the already-uploaded file; nothing is uploaded again.
  const created = await createMaterial(jiaCookie, '现场照片', [
    uploadedAttachment.id,
  ]);
  expect(created.attachments.map((item) => item.id)).toEqual([
    uploadedAttachment.id,
  ]);

  // Reload: the material read from the API still points at the real bytes.
  const reloaded = await getMaterial(jiaCookie, created.id);
  expect(reloaded.attachments).toHaveLength(1);
  const served = await requestApp(reloaded.attachments[0].contentUrl, {
    headers: { cookie: jiaCookie },
  });
  expect(served.status).toBe(200);
  expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG_BYTES);

  // The owner still sees it; the other account does not.
  expect(
    (
      await requestApp(`${base}/api/project-materials/${created.id}`, {
        headers: { cookie: jiaCookie },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await requestApp(`${base}/api/project-materials/${created.id}`, {
        headers: { cookie: yiCookie },
      })
    ).status,
  ).toBe(404);
  const yiList = (await (
    await requestApp(`${base}/api/project-materials`, {
      headers: { cookie: yiCookie },
    })
  ).json()) as { data: MaterialPayload[] };
  expect(yiList.data.map((item) => item.id)).not.toContain(created.id);
});

it('serves a DOCX attachment body to its owner', async () => {
  const uploaded = await uploadAs(
    jiaCookie,
    '验收报告.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    DOCX_BYTES,
  );
  const created = await createMaterial(jiaCookie, '验收文档', [
    uploaded.attachments[0].id,
  ]);
  const served = await requestApp(created.attachments[0].contentUrl, {
    headers: { cookie: jiaCookie },
  });
  expect(served.status).toBe(200);
  expect(new Uint8Array(await served.arrayBuffer())).toEqual(DOCX_BYTES);
  expect(served.headers.get('content-disposition')).toContain('.docx');
});

it('keeps the upload when the title is missing, then detaches on removal', async () => {
  const uploaded = await uploadAs(
    jiaCookie,
    'photo.png',
    'image/png',
    PNG_BYTES,
  );
  const attachmentId = uploaded.attachments[0].id;

  const rejected = await requestApp(`${base}/api/project-materials`, {
    method: 'POST',
    headers: {
      cookie: jiaCookie,
      'content-type': 'application/json',
      origin: ORIGIN,
      referer: `${base}/materials`,
    },
    body: JSON.stringify({ title: '   ', fileIds: [attachmentId] }),
  });
  expect(rejected.status).toBe(400);
  await expect(rejected.json()).resolves.toMatchObject({
    code: 'TITLE_REQUIRED',
  });

  // The uploaded bytes survive the failed save, so the retry needs no re-upload.
  const stillOwned = await requestApp(uploaded.attachments[0].contentUrl, {
    headers: { cookie: jiaCookie },
  });
  expect(stillOwned.status).toBe(200);

  const created = await createMaterial(jiaCookie, '补上标题', [attachmentId]);
  expect(created.attachments.map((item) => item.id)).toEqual([attachmentId]);

  const detached = await requestApp(
    `${base}/api/project-materials/${created.id}`,
    {
      method: 'PATCH',
      headers: {
        cookie: jiaCookie,
        'content-type': 'application/json',
        origin: ORIGIN,
        referer: `${base}/materials`,
      },
      body: JSON.stringify({ fileIds: [] }),
    },
  );
  expect(detached.status).toBe(200);
  await expect(detached.json()).resolves.toMatchObject({
    data: { attachments: [] },
  });
  expect((await getMaterial(jiaCookie, created.id)).attachments).toEqual([]);
});

it('is isolated from other accounts and anonymous callers', async () => {
  const anonymous = await requestApp(`${base}/api/project-materials`);
  expect(anonymous.status).toBe(401);
  const otherAccount = await requestApp(`${base}/api/project-materials`, {
    headers: { cookie: yiCookie },
  });
  expect(otherAccount.status).toBe(200);
  const body = (await otherAccount.json()) as { data: MaterialPayload[] };
  // 乙 only ever sees their own materials, never 甲's seeded ones.
  expect(body.data.every((item) => item.title.length > 0)).toBe(true);
  expect(body.data.some((item) => item.title.includes('示例'))).toBe(false);
});

it('seeds the two test accounts and two materials idempotently', async () => {
  const database = server.application.container.resolve(databaseManagerToken);
  const materials = database.repository<{ id: string; ownerId: string }>(
    'projectMaterials',
  );
  const seededIds = new Set([
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ]);
  const seededMaterials = async () =>
    (await materials.findMany()).filter((item) => seededIds.has(item.id));

  const seeded = await seededMaterials();
  expect(seeded).toHaveLength(2);

  const users = database.repository<{ id: string; username: string }>('user');
  const accounts = await users.findMany();
  const usernames = accounts.map((account) => account.username);
  expect(usernames).toContain('jia01');
  expect(usernames).toContain('yi01');

  // 甲 owns both demonstration materials; 乙 owns none of them.
  const jia = accounts.find((account) => account.username === 'jia01');
  expect(jia).toBeDefined();
  expect(seeded.every((item) => item.ownerId === jia?.id)).toBe(true);

  // Re-running the seed against a database that already carries its rows must
  // not duplicate the accounts or the demonstration materials.
  await seedDefinition.run({
    config: emptyDatabaseTaskConfig,
    container: server.application.container,
    repository: (collection) => database.repository(collection),
    query: database.query(),
    connection: database.connection(),
  });
  expect(await seededMaterials()).toHaveLength(2);
  expect(
    (await users.findMany()).filter(
      (account) => account.username === 'jia01' || account.username === 'yi01',
    ),
  ).toHaveLength(2);
});

function writeRuntimeTestConfig(directory: string): string {
  const file = path.join(directory, 'config.json');
  writeFileSync(
    file,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      app: { publicOrigin: 'http://localhost' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(directory, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );
  return file;
}

function requestApp(
  input: Request | string | URL,
  requestInit?: RequestInit,
): Response | Promise<Response> {
  const target =
    typeof input === 'string' && input.startsWith('/')
      ? `${ORIGIN}${input}`
      : input;
  const request =
    target instanceof Request ? target : new Request(target, requestInit);
  return server.fetch(request);
}

async function signIn(username: string): Promise<string> {
  const response = await requestApp(`${base}/api/auth/sign-in/username`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'admin123' }),
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

async function upload(
  cookie: string | undefined,
  filename: string,
  mimeType: string,
  bytes: Uint8Array = PNG_BYTES,
): Promise<Response> {
  const form = new FormData();
  form.set('file', new File([bytes], filename, { type: mimeType }));
  return requestApp(`${base}/api/${RESOURCE}:uploadOne`, {
    method: 'POST',
    headers: {
      // A real browser upload carries the same-origin Origin; the authentication
      // middleware checks it before trusting a cookie-authenticated write.
      origin: 'http://localhost',
      referer: `${base}/materials`,
      ...(cookie ? { cookie } : {}),
    },
    body: form,
  });
}

async function uploadAs(
  cookie: string,
  filename: string,
  mimeType: string,
  bytes: Uint8Array = PNG_BYTES,
): Promise<MaterialPayload & { title: string }> {
  const response = await upload(cookie, filename, mimeType, bytes);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: UploadEnvelope };
  const record = body.data.record;
  return {
    id: record.id,
    title: '',
    attachments: [
      {
        id: record.id,
        filename: record.filename,
        mimeType: record.mimeType,
        contentUrl: record.contentUrl,
      },
    ],
  };
}

async function createMaterial(
  cookie: string,
  title: string,
  fileIds: readonly string[],
): Promise<MaterialPayload> {
  const response = await requestApp(`${base}/api/project-materials`, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
      origin: ORIGIN,
      referer: `${base}/materials`,
    },
    body: JSON.stringify({ title, fileIds }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { data: MaterialPayload };
  return body.data;
}

async function getMaterial(
  cookie: string,
  id: string,
): Promise<MaterialPayload> {
  const response = await requestApp(`${base}/api/project-materials/${id}`, {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: MaterialPayload };
  return body.data;
}
