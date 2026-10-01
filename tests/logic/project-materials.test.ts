// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEMO_CORRUPTED_PHOTO,
  DEMO_SITE_DOCUMENT,
  DEMO_SITE_PHOTO,
} from '../../server/providers/demo-fixtures.js';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const JIA = { username: 'ziliao_jia', password: 'Passw0rd!' };
const YI = { username: 'ziliao_yi', password: 'Passw0rd!' };

interface MaterialFile {
  id: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  contentUrl: string;
}

interface Material {
  id: string;
  title: string;
  createdById: string;
  files: MaterialFile[];
}

interface MaterialListBody {
  data: Material[];
}

interface MaterialBody {
  data: Material;
}

interface UploadBody {
  data: { record: MaterialFile };
}

const servers: StandaloneServer[] = [];
const tempDirs: string[] = [];

function writeRuntimeTestConfig(directory: string): string {
  const file = path.join(directory, 'config.json');
  writeFileSync(
    file,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
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

async function createServer(): Promise<StandaloneServer> {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-project-materials-database-'),
  );
  const storageDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-project-materials-storage-'),
  );
  tempDirs.push(databaseDir, storageDir);
  mkdirSync(storageDir, { recursive: true });

  const server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      // The browser-cookie write check compares the request's Origin with the application's public
      // origin, so a test that writes through an authenticated route has to state what that is.
      APP_PUBLIC_ORIGIN: 'http://localhost',
      APP_CONFIG_FILE: writeRuntimeTestConfig(databaseDir),
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir,
    },
  });
  servers.push(server);
  return server;
}

function requestApp(
  server: StandaloneServer,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const method = init?.method ?? 'GET';
  // A browser-cookie write is checked against the application's public origin. The test client is
  // not a browser, so it states the origin the request would have had.
  if (
    headers.has('cookie') &&
    !headers.has('origin') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(method)
  ) {
    headers.set('origin', new URL(input).origin);
  }
  return Promise.resolve(
    server.fetch(new Request(input, { ...init, headers })),
  );
}

function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

async function signIn(
  server: StandaloneServer,
  baseUrl: string,
  account: { username: string; password: string },
): Promise<string> {
  const response = await requestApp(
    server,
    `${baseUrl}/api/auth/sign-in/username`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(account),
    },
  );
  expect(response.status).toBe(200);
  return cookieOf(response);
}

function get(
  server: StandaloneServer,
  url: string,
  cookie?: string,
): Promise<Response> {
  return requestApp(server, url, cookie ? { headers: { cookie } } : undefined);
}

describe('project materials (资料) with private attachments', () => {
  let server: StandaloneServer;
  let baseUrl: string;
  let jiaCookie: string;
  let yiCookie: string;

  beforeEach(async () => {
    server = await createServer();
    baseUrl = `http://localhost${server.application.publicBasePath}`;
    jiaCookie = await signIn(server, baseUrl, JIA);
    yiCookie = await signIn(server, baseUrl, YI);
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((entry) => entry.close()));
    for (const dir of tempDirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  it('seeds two contributors who each see only their own materials', async () => {
    const anonymous = await get(server, `${baseUrl}/api/project-materials`);
    expect(anonymous.status).toBe(401);

    const jiaResponse = await get(
      server,
      `${baseUrl}/api/project-materials`,
      jiaCookie,
    );
    expect(jiaResponse.status).toBe(200);
    const jia = ((await jiaResponse.json()) as MaterialListBody).data;
    expect(jia).toHaveLength(1);
    expect(jia[0]!.title).toBe('1号楼基础施工照片与说明');
    expect(jia[0]!.files).toHaveLength(2);

    // The seeded rows describe the same bytes the provider writes to the disk; if the two drift the
    // content route would serve one file under another file's size.
    const photo = jia[0]!.files.find(
      (file) => file.filename === DEMO_SITE_PHOTO.filename,
    );
    const document = jia[0]!.files.find(
      (file) => file.filename === DEMO_SITE_DOCUMENT.filename,
    );
    expect(photo).toBeDefined();
    expect(photo!.size).toBe(DEMO_SITE_PHOTO.size);
    expect(photo!.mimeType).toBe(DEMO_SITE_PHOTO.mimeType);
    expect(document).toBeDefined();
    expect(document!.size).toBe(DEMO_SITE_DOCUMENT.size);
    expect(document!.mimeType).toBe(DEMO_SITE_DOCUMENT.mimeType);

    const yiResponse = await get(
      server,
      `${baseUrl}/api/project-materials`,
      yiCookie,
    );
    const yi = ((await yiResponse.json()) as MaterialListBody).data;
    expect(yi).toHaveLength(1);
    expect(yi[0]!.title).toBe('2号楼巡检记录');
    expect(yi[0]!.files.map((file) => file.filename)).toContain(
      DEMO_CORRUPTED_PHOTO.filename,
    );
    expect(yi.map((material) => material.id)).not.toContain(jia[0]!.id);

    // A material URL belonging to another contributor reads as missing, not as forbidden, so the
    // response cannot even confirm that the record exists.
    const foreign = await get(
      server,
      `${baseUrl}/api/project-materials/${jia[0]!.id}`,
      yiCookie,
    );
    expect(foreign.status).toBe(404);
  });

  it('serves attachment bytes only to the contributor who owns them', async () => {
    const listResponse = await get(
      server,
      `${baseUrl}/api/project-materials`,
      jiaCookie,
    );
    const material = ((await listResponse.json()) as MaterialListBody).data[0]!;
    const photo = material.files.find(
      (file) => file.filename === DEMO_SITE_PHOTO.filename,
    )!;
    const document = material.files.find(
      (file) => file.filename === DEMO_SITE_DOCUMENT.filename,
    )!;
    const photoUrl = new URL(photo.contentUrl, baseUrl).toString();
    const documentUrl = new URL(document.contentUrl, baseUrl).toString();

    expect((await get(server, photoUrl)).status).toBe(401);
    expect((await get(server, photoUrl, yiCookie)).status).toBe(404);
    expect((await get(server, documentUrl, yiCookie)).status).toBe(404);

    const owner = await get(server, photoUrl, jiaCookie);
    expect(owner.status).toBe(200);
    expect(owner.headers.get('content-type')).toBe(DEMO_SITE_PHOTO.mimeType);
    expect(owner.headers.get('x-content-type-options')).toBe('nosniff');
    expect(owner.headers.get('cache-control')).toContain('no-store');
    expect(new Uint8Array(await owner.arrayBuffer()).byteLength).toBe(
      DEMO_SITE_PHOTO.size,
    );

    const docx = await get(server, documentUrl, jiaCookie);
    expect(docx.status).toBe(200);
    expect(docx.headers.get('content-type')).toBe(DEMO_SITE_DOCUMENT.mimeType);

    // The corrupted sample is served as the image it claims to be. The browser fails to decode it and
    // the preview explains the failure; the content route never pretends the bytes are a valid image.
    const yiList = await get(
      server,
      `${baseUrl}/api/project-materials`,
      yiCookie,
    );
    const corrupted = (
      (await yiList.json()) as MaterialListBody
    ).data[0]!.files.find(
      (file) => file.filename === DEMO_CORRUPTED_PHOTO.filename,
    )!;
    const corruptedUrl = new URL(corrupted.contentUrl, baseUrl).toString();
    const corruptedResponse = await get(server, corruptedUrl, yiCookie);
    expect(corruptedResponse.status).toBe(200);
    expect(corruptedResponse.headers.get('content-type')).toBe(
      DEMO_CORRUPTED_PHOTO.mimeType,
    );
    expect(
      new Uint8Array(await corruptedResponse.arrayBuffer()).byteLength,
    ).toBe(DEMO_CORRUPTED_PHOTO.size);
  });

  it('keeps an uploaded file when the first save fails, then unlinks on save', async () => {
    const form = new FormData();
    form.set(
      'file',
      new File(
        [Buffer.from(DEMO_SITE_DOCUMENT.base64, 'base64')],
        'inspection-notes.docx',
        { type: DEMO_SITE_DOCUMENT.mimeType },
      ),
    );
    const request = (body: FormData): Promise<Response> =>
      requestApp(server, `${baseUrl}/api/projectMaterialFiles:uploadOne`, {
        method: 'POST',
        headers: { cookie: jiaCookie, origin: new URL(baseUrl).origin },
        body,
      });

    const upload = await request(form);
    expect(upload.status).toBe(201);
    const uploaded = ((await upload.json()) as UploadBody).data.record;
    expect(uploaded.filename).toBe('inspection-notes.docx');
    expect(uploaded.size).toBe(DEMO_SITE_DOCUMENT.size);

    // The title is required: the failed save reports the problem and the already-uploaded file stays
    // where it is, which is what lets the retry succeed without uploading it again.
    const missingTitle = await requestApp(
      server,
      `${baseUrl}/api/project-materials`,
      {
        method: 'POST',
        headers: { cookie: jiaCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ title: '   ', fileIds: [uploaded.id] }),
      },
    );
    expect(missingTitle.status).toBe(400);

    const createdResponse = await requestApp(
      server,
      `${baseUrl}/api/project-materials`,
      {
        method: 'POST',
        headers: { cookie: jiaCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          title: '3号楼巡检资料',
          fileIds: [uploaded.id],
        }),
      },
    );
    expect(createdResponse.status).toBe(201);
    const created = ((await createdResponse.json()) as MaterialBody).data;
    expect(created.files).toHaveLength(1);
    expect(created.files[0]!.id).toBe(uploaded.id);

    const otherContributor = await requestApp(
      server,
      `${baseUrl}/api/project-materials`,
      {
        method: 'POST',
        headers: { cookie: yiCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ title: '借用附件', fileIds: [uploaded.id] }),
      },
    );
    expect(otherContributor.status).toBe(404);

    // Saving without the file unlinks it. The row and its bytes remain, so the owner can still fetch
    // the content; there is no recycle bin and nothing is deleted.
    const updatedResponse = await requestApp(
      server,
      `${baseUrl}/api/project-materials/${created.id}`,
      {
        method: 'PUT',
        headers: { cookie: jiaCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ title: '3号楼巡检资料', fileIds: [] }),
      },
    );
    expect(updatedResponse.status).toBe(200);
    const updated = ((await updatedResponse.json()) as MaterialBody).data;
    expect(updated.files).toHaveLength(0);

    const stillThere = await get(
      server,
      new URL(uploaded.contentUrl, baseUrl).toString(),
      jiaCookie,
    );
    expect(stillThere.status).toBe(200);
  });

  it('rejects a file type the first version does not support', async () => {
    const form = new FormData();
    form.set(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'notes.txt', {
        type: 'text/plain',
      }),
    );
    const response = await requestApp(
      server,
      `${baseUrl}/api/projectMaterialFiles:uploadOne`,
      {
        method: 'POST',
        headers: { cookie: jiaCookie, origin: new URL(baseUrl).origin },
        body: form,
      },
    );
    expect(response.status).toBe(415);
  });
});
