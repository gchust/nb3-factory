// @vitest-environment node
import { Buffer } from 'node:buffer';

import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import {
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';
import type { Knex } from 'knex';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

// A real application on its own database: the migrations and seeds of the application and every registered plugin run
// at startup, exactly as `pnpm start` runs them, so the seeded accounts and materials are the ones a user starts with.
const test = createAppTest({
  createServer: createStandaloneServer,
  // A cookie-bearing write needs a trusted origin, which the application derives from this public origin, exactly as a
  // deployment sets it.
  server: { env: { APP_PUBLIC_ORIGIN: 'http://localhost' } },
  config: {
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    hub: { host: { enabled: false } },
  },
});

const OWNER = { username: 'materiala', password: 'MaterialA123!' } as const;
const COLLEAGUE = { username: 'materialb', password: 'MaterialB123!' } as const;

// A real 1x1 PNG, so the byte route has a decodable object to serve.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

interface FileView {
  id: string;
  filename: string;
  ext: string;
  size: number;
  contentUrl: string;
}

interface MaterialView {
  id: string;
  title: string;
  description: string | null;
  files: FileView[];
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** The origin the application is addressed at; a cookie-bearing write needs a trusted one. */
const TEST_ORIGIN = 'http://localhost';

/** A signed-in session as the browser presents it: every request carries the application's own origin. */
function browser(session: TestSession): TestSession {
  return {
    ...session,
    fetch: (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (!headers.has('origin')) headers.set('origin', TEST_ORIGIN);
      return session.fetch(path, { ...init, headers });
    },
  };
}

/** The page count and the materials of one page, as the list endpoint answers them. */
async function listMaterials(session: {
  fetch(path: string, init?: RequestInit): Promise<Response>;
}): Promise<{ data: MaterialView[]; total: number }> {
  const page = await body<{
    data: MaterialView[];
    meta: { total: number };
  }>(await session.fetch('/projectMaterials?pageSize=100'));
  return { data: page.data, total: page.meta.total };
}

async function upload(
  session: { fetch(path: string, init?: RequestInit): Promise<Response> },
  bytes: Buffer,
  filename: string,
  type: string,
): Promise<FileView> {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], filename, { type }));
  const response = await session.fetch('/projectMaterialFiles/uploadOne', {
    method: 'POST',
    body: form,
  });
  if (response.status !== 201) {
    throw new Error(
      `Upload failed with ${response.status}: ${await response.text()}`,
    );
  }
  return (await body<{ data: { record: FileView } }>(response)).data.record;
}

function jsonRequest(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

test('installs the material tables with the columns the feature reads', async ({
  testApp,
}) => {
  const knex = await testApp.connection.client<Knex>();
  expect(await knex.schema.hasTable('project_materials')).toBe(true);
  expect(await knex.schema.hasTable('project_material_files')).toBe(true);
  expect(
    Object.keys(await knex('project_material_files').columnInfo()),
  ).toEqual(
    expect.arrayContaining([
      'id',
      'disk',
      'key',
      'filename',
      'ext',
      'mime_type',
      'size',
      'material_id',
      'created_by_id',
    ]),
  );
});

test('seeds two isolated archivists and the sample materials of the first', async ({
  testApp,
}) => {
  const owner = browser(await signIn(testApp, OWNER));
  const colleague = browser(await signIn(testApp, COLLEAGUE));

  const owned = await listMaterials(owner);
  expect(owned.total).toBe(2);
  expect(owned.data.map((material) => material.title)).toEqual(
    expect.arrayContaining(['旧城改造项目现场照片', '项目立项报告与扫描件']),
  );

  const extensions = owned.data
    .flatMap((material) => material.files.map((file) => file.ext))
    .sort();
  expect(extensions).toEqual(['docx', 'png', 'png']);

  // Every seeded attachment carries a content URL that is already resolved against the deployment base path, so the
  // browser can open it directly.
  for (const material of owned.data) {
    for (const file of material.files) {
      expect(
        file.contentUrl.startsWith(`${testApp.publicBasePath}/uploads/`),
      ).toBe(true);
    }
  }

  // The second archivist owns nothing and cannot reach the first archivist's records.
  expect(await listMaterials(colleague)).toEqual({ data: [], total: 0 });
  expect(
    (await colleague.fetch(`/projectMaterials/${owned.data[0].id}`)).status,
  ).toBe(404);
});

test('rejects anonymous callers before anything is read or written', async ({
  testApp,
}) => {
  expect((await testApp.request('/projectMaterials')).status).toBe(401);

  const form = new FormData();
  form.append('file', new File([new Uint8Array(PNG_BYTES)], 'x.png'));
  expect(
    (
      await testApp.request('/projectMaterialFiles/uploadOne', {
        method: 'POST',
        body: form,
      })
    ).status,
  ).toBe(401);

  const owner = browser(await signIn(testApp, OWNER));
  const material = (await listMaterials(owner)).data[0];
  const contentUrl = material.files[0].contentUrl;
  expect(
    (await testApp.fetch(new Request(`http://localhost${contentUrl}`))).status,
  ).toBe(401);
});

test('serves an attachment only to the archivist who owns it', async ({
  testApp,
}) => {
  const owner = browser(await signIn(testApp, OWNER));
  const colleague = browser(await signIn(testApp, COLLEAGUE));
  const material = (await listMaterials(owner)).data[0];
  const file = material.files[0];

  const asColleague = await testApp.fetch(
    new Request(`http://localhost${file.contentUrl}`, {
      headers: { cookie: colleague.cookie },
    }),
  );
  expect(asColleague.status).toBe(404);

  const asOwner = await testApp.fetch(
    new Request(`http://localhost${file.contentUrl}`, {
      headers: { cookie: owner.cookie },
    }),
  );
  expect(asOwner.status).toBe(200);
  expect(Buffer.from(await asOwner.arrayBuffer()).length).toBe(file.size);
});

test('keeps an uploaded file through a failed save and links it on retry', async ({
  testApp,
}) => {
  const owner = browser(await signIn(testApp, OWNER));
  const uploaded = await upload(owner, PNG_BYTES, 'new-photo.png', 'image/png');

  // The title is required. The first save is refused, and the upload is still there to be linked by the next one.
  const refused = await owner.fetch(
    '/projectMaterials',
    jsonRequest({ fileIds: [uploaded.id] }),
  );
  expect(refused.status).toBe(400);
  expect(
    (await body<{ error: { reason: string } }>(refused)).error.reason,
  ).toBe('INVALID_INPUT');

  const created = await owner.fetch(
    '/projectMaterials',
    jsonRequest({ title: '现场补拍照片', fileIds: [uploaded.id] }),
  );
  expect(created.status).toBe(201);
  const material = (await body<{ data: MaterialView }>(created)).data;
  expect(material.files.map((file) => file.id)).toEqual([uploaded.id]);
});

test('accepts only PNG photos and DOCX documents as attachments', async ({
  testApp,
}) => {
  const owner = browser(await signIn(testApp, OWNER));
  const notes = await upload(
    owner,
    Buffer.from('notes'),
    'notes.txt',
    'text/plain',
  );

  const refused = await owner.fetch(
    '/projectMaterials',
    jsonRequest({ title: '文本资料', fileIds: [notes.id] }),
  );
  expect(refused.status).toBe(400);
  const error = (
    await body<{
      error: { reason: string; fieldViolations?: { field: string }[] };
    }>(refused)
  ).error;
  expect(error.reason).toBe('INVALID_INPUT');
  expect(error.fieldViolations?.[0]?.field).toBe('fileIds');
});

test('never links another archivist’s upload', async ({ testApp }) => {
  const owner = browser(await signIn(testApp, OWNER));
  const colleague = browser(await signIn(testApp, COLLEAGUE));
  const uploaded = await upload(owner, PNG_BYTES, 'private.png', 'image/png');

  const refused = await colleague.fetch(
    '/projectMaterials',
    jsonRequest({ title: '越权附件', fileIds: [uploaded.id] }),
  );
  expect(refused.status).toBe(400);
});

test('unlinks a removed attachment without destroying it', async ({
  testApp,
}) => {
  const owner = browser(await signIn(testApp, OWNER));
  const uploaded = await upload(owner, PNG_BYTES, 'to-remove.png', 'image/png');
  const created = await owner.fetch(
    '/projectMaterials',
    jsonRequest({ title: '待移除附件', fileIds: [uploaded.id] }),
  );
  const material = (await body<{ data: MaterialView }>(created)).data;

  const updated = await owner.fetch(`/projectMaterials/${material.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '待移除附件', fileIds: [] }),
  });
  expect(updated.status).toBe(200);
  expect((await body<{ data: MaterialView }>(updated)).data.files).toEqual([]);

  // The file row stays: removing an attachment unlinks it, it does not recycle or destroy it.
  const knex = await testApp.connection.client<Knex>();
  const row = await knex('project_material_files')
    .where({ id: uploaded.id })
    .first();
  expect(row).toBeTruthy();
  expect(row?.material_id).toBeNull();
});

test('deletes a material but keeps the files it was holding', async ({
  testApp,
}) => {
  const owner = browser(await signIn(testApp, OWNER));
  const uploaded = await upload(owner, PNG_BYTES, 'kept.png', 'image/png');
  const created = await owner.fetch(
    '/projectMaterials',
    jsonRequest({ title: '待删除资料', fileIds: [uploaded.id] }),
  );
  const material = (await body<{ data: MaterialView }>(created)).data;

  const deleted = await owner.fetch(`/projectMaterials/${material.id}`, {
    method: 'DELETE',
  });
  expect(deleted.status).toBe(204);
  expect((await owner.fetch(`/projectMaterials/${material.id}`)).status).toBe(
    404,
  );

  const knex = await testApp.connection.client<Knex>();
  expect(
    await knex('project_material_files').where({ id: uploaded.id }).first(),
  ).toBeTruthy();
});

test('declares its routes in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  expect(document.paths?.['/api/projectMaterials']?.get?.operationId).toBe(
    'projectMaterialsList',
  );
  expect(document.paths?.['/api/projectMaterials']?.post?.operationId).toBe(
    'projectMaterialsCreate',
  );
  const detail = document.paths?.['/api/projectMaterials/{materialId}'];
  expect(detail?.get?.operationId).toBe('projectMaterialsGet');
  expect(detail?.patch?.operationId).toBe('projectMaterialsUpdate');
  expect(detail?.delete?.operationId).toBe('projectMaterialsDelete');
  expect(Object.keys(detail?.delete?.responses ?? {}).sort()).toEqual([
    '204',
    '400',
    '401',
    '404',
    '500',
  ]);
});
