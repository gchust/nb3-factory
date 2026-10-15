// @vitest-environment node
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { createTestApp, type TestApp } from '@nocobase/app-testing/server';
import { afterEach, describe, expect, it } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

interface DocumentView {
  readonly id: string;
  readonly title: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly ownerId: string;
  readonly capabilities: {
    readonly canEdit: boolean;
    readonly canDelete: boolean;
    readonly canManageShares: boolean;
  };
}

interface DocumentList {
  readonly data: DocumentView[];
  readonly meta: { readonly total: number; readonly canCreate: boolean };
}

interface UserRow {
  readonly id: string;
  readonly username?: string;
}

const apps: TestApp[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function startApplication(): Promise<TestApp> {
  const app = await createTestApp({
    connections: ['main'],
    createServer: createStandaloneServer,
    config: {
      app: { publicOrigin: 'http://localhost' },
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        connections: { main: { seeds: { autoRun: true } } },
      },
    },
  });
  apps.push(app);
  return app;
}

async function signIn(
  app: TestApp,
  username: string,
  password: string,
): Promise<string> {
  const response = await app.request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (response.status !== 200) {
    throw new Error(
      `Sign-in for ${username} failed: ${response.status} ${await response.text()}`,
    );
  }
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

function call(
  app: TestApp,
  path: string,
  options: {
    readonly cookie?: string;
    readonly method?: string;
    readonly body?: unknown;
  } = {},
): Promise<Response> {
  const headers = new Headers();
  // A cookie-authenticated write is refused unless its origin is trusted, exactly as a browser's own request carries
  // the application origin; the in-process test client has to say so explicitly.
  headers.set('origin', 'http://localhost');
  if (options.cookie) headers.set('cookie', options.cookie);
  if (options.body !== undefined)
    headers.set('content-type', 'application/json');
  return app.request(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function listDocuments(
  app: TestApp,
  cookie: string,
): Promise<DocumentList> {
  const response = await call(app, '/documents', { cookie });
  expect(response.status).toBe(200);
  return json<DocumentList>(response);
}

function findDocument(list: DocumentList, title: string): DocumentView {
  const document = list.data.find((item) => item.title === title);
  if (!document) {
    throw new Error(
      `No document titled "${title}" in ${list.data.map((item) => item.title).join(', ')}`,
    );
  }
  return document;
}

const PUBLIC_TITLE = '公司规章制度';
const DRAFT_TITLE = '下季度工作计划（草稿）';
const CONFIDENTIAL_TITLE = '薪酬结构说明（保密）';

describe('document library', () => {
  it('serves the seeded library and enforces the sharing and permission rules', async () => {
    const app = await startApplication();

    const anonymous = await call(app, '/documents', {});
    expect(anonymous.status).toBe(401);

    const admin = await signIn(app, 'nocobase', 'admin123');
    const editor = await signIn(app, 'editor', 'admin123');
    const reader = await signIn(app, 'reader', 'admin123');

    // B01: the editor maintains the library and sees every document, including their own drafts.
    const editorList = await listDocuments(app, editor);
    expect(editorList.meta.canCreate).toBe(true);
    const published = findDocument(editorList, PUBLIC_TITLE);
    const draft = findDocument(editorList, DRAFT_TITLE);
    const confidential = findDocument(editorList, CONFIDENTIAL_TITLE);
    expect(published).toMatchObject({ published: true, confidential: false });
    expect(draft).toMatchObject({ published: false, confidential: false });
    expect(confidential).toMatchObject({ published: true, confidential: true });
    expect(editorList.data).toHaveLength(3);

    // The editor can create and change their own document.
    const created = await call(app, '/documents', {
      cookie: editor,
      method: 'POST',
      body: {
        title: '新建资料',
        body: '正文',
        published: false,
        confidential: false,
      },
    });
    if (created.status !== 201) {
      throw new Error(`create failed: ${await created.clone().text()}`);
    }
    expect(created.status).toBe(201);
    const createdDocument = await json<{ data: DocumentView }>(created);
    expect(createdDocument.data.capabilities).toMatchObject({
      canEdit: true,
      canDelete: true,
      canManageShares: false,
    });

    // B01: the reader reads the published, non-confidential document and cannot edit it.
    const readerList = await listDocuments(app, reader);
    expect(readerList.meta.canCreate).toBe(false);
    expect(readerList.data.map((item) => item.id)).toEqual([published.id]);
    expect(readerList.data[0]?.capabilities).toMatchObject({
      canEdit: false,
      canDelete: false,
      canManageShares: false,
    });
    const readOnly = await call(app, `/documents/${published.id}`, {
      cookie: reader,
    });
    expect(readOnly.status).toBe(200);
    const patched = await call(app, `/documents/${published.id}`, {
      cookie: reader,
      method: 'PATCH',
      body: { title: '改名' },
    });
    expect(patched.status).toBe(403);

    // B02: the reader cannot open the draft; an administrator may, and after sharing it the reader may read it.
    const draftAsReader = await call(app, `/documents/${draft.id}`, {
      cookie: reader,
    });
    expect(draftAsReader.status).toBe(404);
    const draftAsAdmin = await call(app, `/documents/${draft.id}`, {
      cookie: admin,
    });
    expect(draftAsAdmin.status).toBe(200);

    const users = await json<{ data: UserRow[] }>(
      await call(app, '/users?q=reader', { cookie: admin }),
    );
    const readerId = users.data.find((user) => user.username === 'reader')?.id;
    expect(readerId).toBeTruthy();

    const shared = await call(app, `/documents/${draft.id}/shares`, {
      cookie: admin,
      method: 'POST',
      body: { userId: readerId },
    });
    expect(shared.status).toBe(201);

    const sharedDraft = await call(app, `/documents/${draft.id}`, {
      cookie: reader,
    });
    expect(sharedDraft.status).toBe(200);
    const sharedDraftView = await json<{ data: DocumentView }>(sharedDraft);
    expect(sharedDraftView.data.capabilities.canEdit).toBe(false);
    expect(
      (await listDocuments(app, reader)).data.map((item) => item.id),
    ).toEqual(expect.arrayContaining([published.id, draft.id]));

    // B03: revoking the share hides the draft again, without a reload on the reader's side.
    const revoked = await call(
      app,
      `/documents/${draft.id}/shares/${readerId}`,
      {
        cookie: admin,
        method: 'DELETE',
      },
    );
    expect(revoked.status).toBe(204);
    const afterRevoke = await call(app, `/documents/${draft.id}`, {
      cookie: reader,
    });
    expect(afterRevoke.status).toBe(404);
    expect(
      (await listDocuments(app, reader)).data.map((item) => item.id),
    ).toEqual([published.id]);

    // B04: sharing a confidential document changes nothing for the reader; the owner keeps access.
    const sharedConfidential = await call(
      app,
      `/documents/${confidential.id}/shares`,
      {
        cookie: admin,
        method: 'POST',
        body: { userId: readerId },
      },
    );
    expect(sharedConfidential.status).toBe(201);
    expect(
      (await call(app, `/documents/${confidential.id}`, { cookie: reader }))
        .status,
    ).toBe(404);
    expect(
      (await call(app, `/documents/${confidential.id}`, { cookie: editor }))
        .status,
    ).toBe(200);

    // B05: disabling the reader blocks the session they already hold; the editor is unaffected.
    const disabled = await call(app, `/users/${readerId}/disable`, {
      cookie: admin,
      method: 'POST',
    });
    expect(disabled.status).toBe(200);
    const blocked = await call(app, '/documents', { cookie: reader });
    expect(blocked.status).toBe(401);
    const editorStillWorks = await listDocuments(app, editor);
    expect(editorStillWorks.data.length).toBeGreaterThanOrEqual(3);
  });

  it('documents its own endpoints in the API document', async () => {
    const app = await startApplication();
    const admin = await signIn(app, 'nocobase', 'admin123');

    // Every endpoint the application writes declares itself, and the generated document has no schema problem.
    expect(findUndeclaredApiRoutes(app.application)).toEqual([]);
    const apiDocument = await app.application.container
      .resolve(apiDocsToken)
      .getDocument();
    expect(findApiDocumentSchemaProblems(apiDocument)).toEqual([]);
    expect(
      apiDocument.paths?.['/api/documents/{documentId}/shares']?.post
        ?.operationId,
    ).toBe('documentsCreateShare');

    const document = await call(app, '/swagger', { cookie: admin });
    expect(document.status).toBe(200);
    const text = await document.text();
    expect(text).toContain('documentsList');
    expect(text).toContain('documentsCreateShare');
    expect(text).toContain('documentsRevokeShare');
  });
});
