// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

/**
 * The documents feature as a user meets it: the application starts the way `pnpm start` starts it, on
 * test databases, with its migrations, seeds and the two isolated identities provisioned. Every
 * request goes through the real authentication and authorization middleware.
 */
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    // The origin the test's own requests claim, and the one the authentication plugin trusts for
    // cookie-authenticated writes; a deployment sets `APP_PUBLIC_ORIGIN` to the same effect.
    app: { publicOrigin: 'http://localhost' },
  },
});

const SUPERVISOR = {
  username: 'supervisor',
  password: 'supervisor123',
} as const;
const COLLEAGUE = { username: 'colleague', password: 'colleague123' } as const;

const SHARED_TITLE = '蓝鹭设备报修电话';
const SECRET_TITLE = '保密项目内部代号';
const SECRET_VALUE = '墨竹 729';

interface DocumentPayload {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly accessLevel: string;
  readonly updatedAt: string;
}

async function listDocuments(session: TestSession): Promise<DocumentPayload[]> {
  const response = await session.fetch('/documents');
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: DocumentPayload[] };
  return body.data;
}

function findDocument(
  documents: readonly DocumentPayload[],
  title: string,
): DocumentPayload {
  const found = documents.find((document) => document.title === title);
  if (!found) throw new Error(`The seed document "${title}" is missing.`);
  return found;
}

/**
 * A cookie-authenticated write, as the browser's own fetch sends it: an `Origin` the application
 * trusts, without which the authentication plugin refuses the request before it reaches the route.
 */
const writeHeaders = {
  'content-type': 'application/json',
  origin: 'http://localhost',
} as const;

test('declares its API routes in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);
  expect(document.paths?.['/api/documents']?.get?.operationId).toBe(
    'listDocuments',
  );
  expect(document.paths?.['/api/documents/{id}']?.get?.operationId).toBe(
    'getDocument',
  );
  expect(document.paths?.['/api/documents/{id}']?.put?.operationId).toBe(
    'updateDocument',
  );
});

test('refuses an anonymous read', async ({ request }) => {
  expect((await request('/documents')).status).toBe(401);
});

test('lets a colleague read only the shared documents', async ({ testApp }) => {
  const colleague = await signIn(testApp, COLLEAGUE);
  const documents = await listDocuments(colleague);

  expect(documents.map((document) => document.title).sort()).toEqual(
    [SHARED_TITLE, '蓝鹭设备常规巡检间隔'].sort(),
  );
  // The supervisor-only fact must not reach the colleague through any field of the payload.
  expect(JSON.stringify(documents)).not.toContain(SECRET_VALUE);
  expect(JSON.stringify(documents)).not.toContain(SECRET_TITLE);
});

test('does not disclose the supervisor-only document to a colleague', async ({
  testApp,
}) => {
  const supervisor = await signIn(testApp, SUPERVISOR);
  const secret = findDocument(await listDocuments(supervisor), SECRET_TITLE);

  const colleague = await signIn(testApp, COLLEAGUE);
  const read = await colleague.fetch(`/documents/${secret.id}`);
  expect(read.status).toBe(404);
  expect(await read.text()).not.toContain(SECRET_VALUE);

  // The colleague has no `edit` action at all, so the write is refused before the row is looked up;
  // the refusal must not name the document.
  const write = await colleague.fetch(`/documents/${secret.id}`, {
    method: 'PUT',
    headers: writeHeaders,
    body: JSON.stringify({ title: SECRET_TITLE, body: '篡改' }),
  });
  expect(write.status).toBe(403);
  expect(await write.text()).not.toContain(SECRET_VALUE);

  // The refused write changed nothing.
  expect(
    findDocument(await listDocuments(supervisor), SECRET_TITLE).body,
  ).toContain(SECRET_VALUE);
});

test('refuses a colleague an edit it has no permission for', async ({
  testApp,
}) => {
  const supervisor = await signIn(testApp, SUPERVISOR);
  const shared = findDocument(await listDocuments(supervisor), SHARED_TITLE);

  const colleague = await signIn(testApp, COLLEAGUE);
  const response = await colleague.fetch(`/documents/${shared.id}`, {
    method: 'PUT',
    headers: writeHeaders,
    body: JSON.stringify({ title: shared.title, body: '同事的修改' }),
  });
  expect(response.status).toBe(403);
});

test('a supervisor edit reaches the colleague on the next read', async ({
  testApp,
}) => {
  const supervisor = await signIn(testApp, SUPERVISOR);
  const inspected = findDocument(
    await listDocuments(supervisor),
    '蓝鹭设备常规巡检间隔',
  );

  const updatedBody = '蓝鹭设备常规巡检间隔为 60 天。';
  const updated = await supervisor.fetch(`/documents/${inspected.id}`, {
    method: 'PUT',
    headers: writeHeaders,
    body: JSON.stringify({ title: inspected.title, body: updatedBody }),
  });
  expect(updated.status).toBe(200);

  const colleague = await signIn(testApp, COLLEAGUE);
  const reread = findDocument(
    await listDocuments(colleague),
    '蓝鹭设备常规巡检间隔',
  );
  expect(reread.body).toBe(updatedBody);
  expect(reread.updatedAt).not.toBe(inspected.updatedAt);
});
