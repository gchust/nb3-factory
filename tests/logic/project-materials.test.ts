// @vitest-environment node
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import {
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest, type TestApp } from '@nocobase/app-testing/server';
import { assert, beforeEach, expect } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.ts';

/**
 * The material API and the attachment boundary, through the whole application:
 * its own database, its own seeds, its own sign-in route. `jia` owns the two
 * seeded materials; `yi` owns nothing and is the caller the boundary has to
 * hold against.
 */

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      // `auth.required()` refuses a cookie-authenticated write whose Origin is
      // not trusted, which is the framework's CSRF boundary, not ours. A
      // browser sends this header; a test has to send it too.
      baseURL: 'http://localhost',
      trustedOrigins: ['http://localhost'],
    },
  },
});

const JIA = { username: 'jia', password: 'jia123456' };
const YI = { username: 'tongshi', password: 'tongshi123456' };

const MATERIAL_ONE_ID = 'b1b2c3d4-0001-4000-8000-000000000001';
const MATERIAL_TWO_ID = 'b1b2c3d4-0002-4000-8000-000000000002';
const SEEDED_PNG_ID = 'c1b2c3d4-0001-4000-8000-000000000001';
const SEEDED_CORRUPT_PNG_ID = 'c1b2c3d4-0002-4000-8000-000000000002';
const SEEDED_DOCX_ID = 'c1b2c3d4-0003-4000-8000-000000000003';

/** A 1x1 valid PNG, so an upload in a test stores real decodable bytes. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let jia: TestSession;
let yi: TestSession;

beforeEach(async ({ testApp }) => {
  jia = await signIn(testApp, JIA);
  yi = await signIn(testApp, YI);
});

/** The headers a browser sends on a cookie-authenticated write, in a test. */
const WRITE_HEADERS = {
  origin: 'http://localhost',
  'content-type': 'application/json',
} as const;

/** The absolute URL of an attachment's bytes: at the root, not below `/api`. */
function fileUrl(app: TestApp, id: string, ext: string): string {
  return `http://localhost${app.publicBasePath}/projectMaterialFiles/${id}.${ext}`;
}

async function uploadPng(
  session: TestSession,
  filename = '现场照片.png',
): Promise<string> {
  const form = new FormData();
  form.append(
    'file',
    new File([ONE_PIXEL_PNG], filename, { type: 'image/png' }),
  );
  const response = await session.fetch('/projectMaterialFiles/uploadOne', {
    method: 'POST',
    headers: { origin: 'http://localhost' },
    body: form,
  });
  // `assert` carries the body, which a bare status assertion cannot show.
  assert.equal(response.status, 201, await response.clone().text());
  const body = (await response.json()) as {
    data: { record: { id: string; ext: string; contentUrl: string } };
  };
  expect(body.data.record.ext).toBe('png');
  return body.data.record.id;
}

async function createMaterial(
  session: TestSession,
  title: string,
  fileIds: readonly string[],
): Promise<Response> {
  return session.fetch('/projectMaterials', {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: JSON.stringify({ title, fileIds }),
  });
}

test('lists only the materials of the signed-in owner', async ({ testApp }) => {
  const anonymous = await testApp.request('/projectMaterials');
  expect(anonymous.status).toBe(401);

  const own = await jia.fetch('/projectMaterials');
  expect(own.status).toBe(200);
  const ownBody = (await own.json()) as {
    data: {
      id: string;
      title: string;
      files: { id: string; filename: string; contentUrl: string }[];
    }[];
    meta: { total: number };
  };
  expect(ownBody.meta.total).toBeGreaterThanOrEqual(2);
  const photoAlbum = ownBody.data.find(
    (material) => material.id === MATERIAL_ONE_ID,
  );
  expect(photoAlbum?.title).toBe('工地现场照片归档');
  expect(photoAlbum?.files).toHaveLength(2);
  expect(
    photoAlbum?.files.every((file) => file.contentUrl.includes(file.id)),
  ).toBe(true);
  const document = ownBody.data.find(
    (material) => material.id === MATERIAL_TWO_ID,
  );
  expect(document?.files.map((file) => file.filename)).toEqual([
    '项目需求文档.docx',
  ]);

  const others = await yi.fetch('/projectMaterials');
  expect(others.status).toBe(200);
  expect(((await others.json()) as { data: unknown[] }).data).toEqual([]);
});

test('reads a material only for the owner', async () => {
  const own = await jia.fetch(`/projectMaterials/${MATERIAL_ONE_ID}`);
  expect(own.status).toBe(200);
  expect(((await own.json()) as { data: { id: string } }).data.id).toBe(
    MATERIAL_ONE_ID,
  );

  const other = await yi.fetch(`/projectMaterials/${MATERIAL_ONE_ID}`);
  expect(other.status).toBe(404);

  const unknown = await jia.fetch(
    '/projectMaterials/00000000-0000-4000-8000-000000000000',
  );
  expect(unknown.status).toBe(404);
});

test('refuses a blank title, then saves the same upload once one is given', async () => {
  const fileId = await uploadPng(jia);

  const refused = await createMaterial(jia, '   ', [fileId]);
  expect(refused.status).toBe(400);
  expect(
    ((await refused.json()) as { error: { reason: string } }).error.reason,
  ).toBe('MATERIAL_TITLE_REQUIRED');

  // The client never re-uploads: the same id is submitted again.
  const saved = await createMaterial(jia, '补充标题后保存', [fileId]);
  assert.equal(saved.status, 201, await saved.clone().text());
  const body = (await saved.json()) as {
    data: { title: string; files: { id: string }[] };
  };
  expect(body.data.title).toBe('补充标题后保存');
  expect(body.data.files.map((file) => file.id)).toEqual([fileId]);
});

test('refuses an attachment the caller does not own', async () => {
  const response = await createMaterial(yi, '借用别人的附件', [SEEDED_PNG_ID]);
  expect(response.status).toBe(400);
  expect(
    ((await response.json()) as { error: { reason: string } }).error.reason,
  ).toBe('MATERIAL_FILE_NOT_FOUND');
});

test('detaches a removed attachment instead of deleting it', async ({
  testApp,
}) => {
  const kept = await uploadPng(jia);

  const created = await createMaterial(jia, '两个附件', [SEEDED_PNG_ID, kept]);
  assert.equal(created.status, 201, await created.clone().text());
  const materialId = ((await created.json()) as { data: { id: string } }).data
    .id;

  const updated = await jia.fetch(`/projectMaterials/${materialId}`, {
    method: 'PATCH',
    headers: WRITE_HEADERS,
    body: JSON.stringify({ fileIds: [SEEDED_PNG_ID] }),
  });
  expect(updated.status).toBe(200);
  expect(
    ((await updated.json()) as { data: { files: { id: string }[] } }).data
      .files,
  ).toEqual([expect.objectContaining({ id: SEEDED_PNG_ID })]);

  const reread = await jia.fetch(`/projectMaterials/${materialId}`);
  expect(await reread.json()).toMatchObject({
    data: { files: [{ id: SEEDED_PNG_ID }] },
  });

  // Detaching unlinks the record; the file itself and its bytes are still there.
  const bytes = await jia.fetch(fileUrl(testApp, kept, 'png'));
  expect(bytes.status).toBe(200);
});

test('serves attachment bytes to the owner and to nobody else', async ({
  testApp,
}) => {
  const anonymous = await testApp.fetch(
    new Request(fileUrl(testApp, SEEDED_PNG_ID, 'png')),
  );
  expect(anonymous.status).toBe(401);

  const refused = await yi.fetch(fileUrl(testApp, SEEDED_PNG_ID, 'png'));
  expect(refused.status).toBe(404);

  const allowed = await jia.fetch(fileUrl(testApp, SEEDED_PNG_ID, 'png'));
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get('content-type')).toContain('image/png');
  const bytes = Buffer.from(await allowed.arrayBuffer());
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );

  // A corrupt PNG is still the owner's file: the boundary is about ownership,
  // not about whether a decoder accepts the bytes.
  const corrupt = await jia.fetch(
    fileUrl(testApp, SEEDED_CORRUPT_PNG_ID, 'png'),
  );
  expect(corrupt.status).toBe(200);
});

test('serves the stored DOCX to its owner', async ({ testApp }) => {
  const response = await jia.fetch(fileUrl(testApp, SEEDED_DOCX_ID, 'docx'));
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain(
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
});

test('declares every route in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);
  const paths = document.paths ?? {};
  expect(paths['/api/projectMaterials']?.get?.operationId).toBe(
    'projectMaterialsList',
  );
  expect(paths['/api/projectMaterials']?.post?.operationId).toBe(
    'projectMaterialsCreate',
  );
  expect(paths['/api/projectMaterials/{materialId}']?.patch?.operationId).toBe(
    'projectMaterialsUpdate',
  );
  expect(paths['/api/projectMaterialFiles/uploadOne']?.post?.operationId).toBe(
    'projectMaterialFilesUploadOne',
  );
});
