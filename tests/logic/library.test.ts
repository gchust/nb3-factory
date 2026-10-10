// @vitest-environment node

import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

// `createTestApp()` writes the configuration file but not the environment;
// the authentication plugin refuses to start without a secret.
process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

// The identities the installation seeds create. See `database/main/seeds/`.
const EDITOR_ID = '10000000-0000-4000-8000-000000000001';
const READER_ID = '10000000-0000-4000-8000-000000000002';
const PUBLIC_DOCUMENT_ID = '10000000-0000-4000-8000-0000000000a1';
const DRAFT_DOCUMENT_ID = '10000000-0000-4000-8000-0000000000d2';
const CONFIDENTIAL_DOCUMENT_ID = '10000000-0000-4000-8000-0000000000c3';

const EDITOR_CREDENTIALS = {
  username: 'library_editor',
  password: 'LibraryEditor@123',
};
const READER_CREDENTIALS = {
  username: 'library_reader',
  password: 'LibraryReader@123',
};

const test = createAppTest({
  createServer: createStandaloneServer,
  // The authentication plugin trusts the application's public origin for
  // cookie-authenticated writes; pin it so the test's Origin header matches.
  server: { env: { APP_PUBLIC_ORIGIN: 'http://localhost' } },
});

interface DocumentView {
  readonly id: string;
  readonly title: string;
  readonly content: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface TestSessionLike {
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

async function listIds(session: TestSessionLike): Promise<string[]> {
  const response = await session.fetch('/library/documents');
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: DocumentView[] };
  return body.data.map((document) => document.id).sort();
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

// A cookie-authenticated write needs an Origin the authentication plugin
// trusts, exactly as a browser sends one.
const ORIGIN = 'http://localhost';
const jsonHeaders = {
  'content-type': 'application/json',
  origin: ORIGIN,
};

test('declares every route in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);

  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  const list = document.paths?.['/api/library/documents']?.get;
  expect(list?.operationId).toBe('listLibraryDocuments');
  expect(list?.responses['200']).toBeDefined();
});

test('rejects an anonymous reader', async ({ request }) => {
  expect((await request('/library/documents')).status).toBe(401);
});

test('shows a reader only the published, non-confidential documents', async ({
  testApp,
}) => {
  const reader = await signIn(testApp, READER_CREDENTIALS);

  expect(await listIds(reader)).toEqual([PUBLIC_DOCUMENT_ID]);
  expect(
    (await reader.fetch(`/library/documents/${PUBLIC_DOCUMENT_ID}`)).status,
  ).toBe(200);
  expect(
    (await reader.fetch(`/library/documents/${DRAFT_DOCUMENT_ID}`)).status,
  ).toBe(404);
  expect(
    (await reader.fetch(`/library/documents/${CONFIDENTIAL_DOCUMENT_ID}`))
      .status,
  ).toBe(404);
});

test('lets the owner read every document they own', async ({ testApp }) => {
  const editor = await signIn(testApp, EDITOR_CREDENTIALS);

  expect(await listIds(editor)).toEqual(
    [PUBLIC_DOCUMENT_ID, DRAFT_DOCUMENT_ID, CONFIDENTIAL_DOCUMENT_ID].sort(),
  );
});

test('refuses a reader write before validating the request body', async ({
  testApp,
}) => {
  const reader = await signIn(testApp, READER_CREDENTIALS);

  // An empty body is invalid, but the permission check runs first: 403, not 400.
  const response = await reader.fetch('/library/documents', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({}),
  });
  expect(response.status).toBe(403);
});

test('lets the editor maintain only their own documents', async ({
  testApp,
}) => {
  const editor = await signIn(testApp, EDITOR_CREDENTIALS);
  const reader = await signIn(testApp, READER_CREDENTIALS);

  // `ownerId` is taken from the session, so a body that tries to set it fails
  // the strict schema rather than being silently ignored.
  const spoofed = await editor.fetch('/library/documents', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ title: '伪造归属', ownerId: READER_ID }),
  });
  expect(spoofed.status).toBe(400);

  const created = await editor.fetch('/library/documents', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ title: '新资料', content: '正文' }),
  });
  expect(created.status).toBe(201);
  const document = await json<{ data: DocumentView }>(created);
  expect(document.data.ownerId).toBe(EDITOR_ID);
  expect(typeof document.data.id).toBe('string');
  expect(document.data.published).toBe(false);

  const edited = await editor.fetch(`/library/documents/${document.data.id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ published: true }),
  });
  expect(edited.status).toBe(200);
  expect((await json<{ data: DocumentView }>(edited)).data.published).toBe(
    true,
  );

  // Reading does not imply editing: the reader holds no write grant.
  const readerEdit = await reader.fetch(
    `/library/documents/${document.data.id}`,
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ title: '越权修改' }),
    },
  );
  expect(readerEdit.status).toBe(403);

  const removed = await editor.fetch(`/library/documents/${document.data.id}`, {
    method: 'DELETE',
    headers: { origin: ORIGIN },
  });
  expect(removed.status).toBe(204);
  expect(
    (await editor.fetch(`/library/documents/${document.data.id}`)).status,
  ).toBe(404);
});

test('shares one draft with the reader and revokes it', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const reader = await signIn(testApp, READER_CREDENTIALS);

  expect(
    (await reader.fetch(`/library/documents/${DRAFT_DOCUMENT_ID}`)).status,
  ).toBe(404);

  const shared = await admin.fetch('/authorization/sharingRules', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      key: 'library-draft-share-reader',
      resource: { type: 'composite', id: 'library.documents' },
      actions: [
        {
          action: 'view',
          scopeKey: 'libraryDocuments',
          selection: { type: 'records', ids: [DRAFT_DOCUMENT_ID] },
        },
      ],
      subjects: [{ type: 'user', id: READER_ID }],
    }),
  });
  expect(shared.status).toBe(201);

  expect(
    (await reader.fetch(`/library/documents/${DRAFT_DOCUMENT_ID}`)).status,
  ).toBe(200);
  expect(await listIds(reader)).toContain(DRAFT_DOCUMENT_ID);

  const revoked = await admin.fetch(
    '/authorization/sharingRules/library-draft-share-reader',
    { method: 'DELETE', headers: { origin: ORIGIN } },
  );
  expect(revoked.status).toBe(204);

  // A fresh request after revocation sees nothing, which is what a refresh or
  // a reopened page performs.
  expect(
    (await reader.fetch(`/library/documents/${DRAFT_DOCUMENT_ID}`)).status,
  ).toBe(404);
  expect(await listIds(reader)).not.toContain(DRAFT_DOCUMENT_ID);
});

test('keeps a confidential document hidden even when it is shared', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const reader = await signIn(testApp, READER_CREDENTIALS);
  const editor = await signIn(testApp, EDITOR_CREDENTIALS);

  const shared = await admin.fetch('/authorization/sharingRules', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      key: 'library-confidential-share-reader',
      resource: { type: 'composite', id: 'library.documents' },
      actions: [
        {
          action: 'view',
          scopeKey: 'libraryDocuments',
          selection: { type: 'records', ids: [CONFIDENTIAL_DOCUMENT_ID] },
        },
      ],
      subjects: [{ type: 'user', id: READER_ID }],
    }),
  });
  expect(shared.status).toBe(201);

  // The restriction narrows the grant, so the share cannot reveal it.
  expect(
    (await reader.fetch(`/library/documents/${CONFIDENTIAL_DOCUMENT_ID}`))
      .status,
  ).toBe(404);
  expect(await listIds(reader)).not.toContain(CONFIDENTIAL_DOCUMENT_ID);

  // The restriction names only 乙; 甲's access is unaffected.
  expect(
    (await editor.fetch(`/library/documents/${CONFIDENTIAL_DOCUMENT_ID}`))
      .status,
  ).toBe(200);

  await admin.fetch(
    '/authorization/sharingRules/library-confidential-share-reader',
    { method: 'DELETE', headers: { origin: ORIGIN } },
  );
});

test('blocks an existing session when the reader is deactivated', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const reader = await signIn(testApp, READER_CREDENTIALS);

  expect(
    (await reader.fetch(`/library/documents/${PUBLIC_DOCUMENT_ID}`)).status,
  ).toBe(200);

  const disabled = await admin.fetch(`/users/${READER_ID}/disable`, {
    method: 'POST',
    headers: { origin: ORIGIN },
  });
  expect(disabled.status).toBe(200);

  // The session that was already signed in stops being accepted.
  expect(
    (await reader.fetch(`/library/documents/${PUBLIC_DOCUMENT_ID}`)).status,
  ).toBe(401);
});
