// @vitest-environment node

import { expect } from 'vitest';

import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';

import { createStandaloneServer } from '../../server/standalone.ts';
import {
  DEMO_PASSWORD,
  DEMO_USERS,
} from '../../database/seed-data/documents.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const test = createAppTest({ createServer: createStandaloneServer });

interface DocumentItem {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly canEdit: boolean;
}

interface DocumentList {
  readonly data: readonly DocumentItem[];
  readonly meta: { readonly total: number; readonly canCreate: boolean };
}

interface DocumentDetail {
  readonly data: DocumentItem;
}

interface AdminDocument {
  readonly id: string;
  readonly title: string;
  readonly shares: readonly {
    readonly userId: string;
    readonly name: string;
    readonly username: string | null;
  }[];
}

interface AdminDocumentList {
  readonly data: readonly AdminDocument[];
}

interface RecipientList {
  readonly data: readonly {
    readonly id: string;
    readonly name: string;
    readonly username: string | null;
    readonly email: string;
  }[];
}

async function readJson<T>(response: Response): Promise<T> {
  expect(response.type).not.toBe('error');
  return (await response.json()) as T;
}

async function listDocuments(session: TestSession): Promise<DocumentList> {
  const response = await session.fetch('/documents');
  expect(response.status).toBe(200);
  return readJson<DocumentList>(response);
}

async function signInAs(
  testApp: Parameters<typeof signIn>[0],
  username: string,
  password: string,
): Promise<TestSession> {
  return signIn(testApp, { username, password });
}

test('anonymous readers are refused, and visibility follows the owner and publication rules', async ({
  testApp,
  request,
}) => {
  const anonymous = await request('/documents');
  expect(anonymous.status).toBe(401);

  const admin = await signInAs(
    testApp,
    DEFAULT_ADMIN_CREDENTIALS.username,
    DEFAULT_ADMIN_CREDENTIALS.password,
  );
  const editor = await signInAs(
    testApp,
    DEMO_USERS.editor.username,
    DEMO_PASSWORD,
  );
  const reader = await signInAs(
    testApp,
    DEMO_USERS.reader.username,
    DEMO_PASSWORD,
  );

  const [adminList, editorList, readerList] = await Promise.all([
    listDocuments(admin),
    listDocuments(editor),
    listDocuments(reader),
  ]);

  expect(adminList.data).toHaveLength(3);
  expect(editorList.data).toHaveLength(3);
  expect(readerList.data.map((document) => document.title)).toEqual([
    '内部资料：新员工入职指南',
  ]);

  expect(adminList.meta.canCreate).toBe(true);
  expect(editorList.meta.canCreate).toBe(true);
  expect(readerList.meta.canCreate).toBe(false);
  expect(readerList.data[0]).toMatchObject({
    published: true,
    confidential: false,
    canEdit: false,
  });
  expect(editorList.data.every((document) => document.canEdit)).toBe(true);

  const draft = editorList.data.find((document) => !document.published)!;
  const confidential = editorList.data.find(
    (document) => document.confidential,
  )!;
  expect((await reader.fetch(`/documents/${draft.id}`)).status).toBe(404);
  expect((await reader.fetch(`/documents/${confidential.id}`)).status).toBe(
    404,
  );
});

test('a reader can never edit or create documents, even when a document is open for reading', async ({
  testApp,
}) => {
  const reader = await signInAs(
    testApp,
    DEMO_USERS.reader.username,
    DEMO_PASSWORD,
  );
  const list = await listDocuments(reader);
  const published = list.data[0];

  const update = await reader.fetch(`/documents/${published.id}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({ title: 'Changed by a reader' }),
  });
  expect(update.status).toBe(403);
  expect(await readJson<{ error: { reason: string } }>(update)).toMatchObject({
    error: { reason: 'DOCUMENTS_ACCESS_DENIED' },
  });

  const create = await reader.fetch('/documents', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({
      title: 'Reader-created document',
      content: 'This must not be created.',
    }),
  });
  expect(create.status).toBe(403);
});

test('an editor creates and edits only their own documents', async ({
  testApp,
}) => {
  const editor = await signInAs(
    testApp,
    DEMO_USERS.editor.username,
    DEMO_PASSWORD,
  );

  const created = await editor.fetch('/documents', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({
      title: '资料员新建草稿',
      content: '这是资料员甲新建的草稿内容。',
      published: false,
      confidential: false,
    }),
  });
  expect(created.status).toBe(201);
  const document = (await readJson<DocumentDetail>(created)).data;
  expect(document).toMatchObject({
    title: '资料员新建草稿',
    published: false,
    confidential: false,
    canEdit: true,
  });
  expect(document.ownerId).toBe(editor.user.id);

  const updated = await editor.fetch(`/documents/${document.id}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({ content: '更新后的草稿内容。' }),
  });
  expect(updated.status).toBe(200);
  expect((await readJson<DocumentDetail>(updated)).data.content).toBe(
    '更新后的草稿内容。',
  );
});

test('an administrator opens one draft temporarily and revoking it closes the original link again', async ({
  testApp,
}) => {
  const admin = await signInAs(
    testApp,
    DEFAULT_ADMIN_CREDENTIALS.username,
    DEFAULT_ADMIN_CREDENTIALS.password,
  );
  const reader = await signInAs(
    testApp,
    DEMO_USERS.reader.username,
    DEMO_PASSWORD,
  );
  const editor = await signInAs(
    testApp,
    DEMO_USERS.editor.username,
    DEMO_PASSWORD,
  );
  const anotherDraftResponse = await editor.fetch('/documents', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({
      title: '另一份不共享的草稿',
      content: '临时共享只应开放管理员选中的那一份资料。',
      published: false,
      confidential: false,
    }),
  });
  expect(anotherDraftResponse.status).toBe(201);
  const anotherDraft = (await readJson<DocumentDetail>(anotherDraftResponse))
    .data;

  const recipientsResponse = await admin.fetch('/documentSharing/recipients');
  expect(recipientsResponse.status).toBe(200);
  const recipients = await readJson<RecipientList>(recipientsResponse);
  const readerUser = recipients.data.find(
    (recipient) => recipient.username === DEMO_USERS.reader.username,
  )!;
  expect(readerUser.name).toBe(DEMO_USERS.reader.name);

  const documentsResponse = await admin.fetch('/documentSharing/documents');
  expect(documentsResponse.status).toBe(200);
  const adminDocuments = await readJson<AdminDocumentList>(documentsResponse);
  const draft = adminDocuments.data.find(
    (document) => document.title === '草稿：第三季度资料整理计划',
  )!;
  const confidential = adminDocuments.data.find(
    (document) => document.confidential,
  )!;

  const share = await admin.fetch(`/documentSharing/shares/${draft.id}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({ userId: readerUser.id }),
  });
  expect(share.status).toBe(200);

  const opened = await reader.fetch(`/documents/${draft.id}`);
  expect(opened.status).toBe(200);
  expect((await readJson<DocumentDetail>(opened)).data.title).toBe(draft.title);
  const sharedList = await listDocuments(reader);
  expect(sharedList.data.map((document) => document.id)).toContain(draft.id);
  expect(sharedList.data.map((document) => document.id)).not.toContain(
    anotherDraft.id,
  );

  const sharedDocuments = await readJson<AdminDocumentList>(
    await admin.fetch('/documentSharing/documents'),
  );
  expect(
    sharedDocuments.data
      .find((document) => document.id === draft.id)!
      .shares.map((item) => item.userId),
  ).toEqual([readerUser.id]);

  const confidentialShare = await admin.fetch(
    `/documentSharing/shares/${confidential.id}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ userId: readerUser.id }),
    },
  );
  expect(confidentialShare.status).toBe(400);
  expect(
    await readJson<{ error: { reason: string } }>(confidentialShare),
  ).toMatchObject({ error: { reason: 'CONFIDENTIAL_DOCUMENT' } });
  expect((await reader.fetch(`/documents/${confidential.id}`)).status).toBe(
    404,
  );

  const revoke = await admin.fetch(
    `/documentSharing/shares/${draft.id}/${readerUser.id}`,
    {
      method: 'DELETE',
      headers: { origin: 'http://localhost' },
    },
  );
  expect(revoke.status).toBe(204);
  expect((await reader.fetch(`/documents/${draft.id}`)).status).toBe(404);
  expect(
    (await listDocuments(reader)).data.map((document) => document.id),
  ).not.toContain(draft.id);
});

test('only an administrator may change temporary sharing, and editors keep their own access', async ({
  testApp,
}) => {
  const editor = await signInAs(
    testApp,
    DEMO_USERS.editor.username,
    DEMO_PASSWORD,
  );

  expect((await editor.fetch('/documentSharing/documents')).status).toBe(403);
  expect((await editor.fetch('/documentSharing/recipients')).status).toBe(403);
  expect(
    (
      await editor.fetch('/documentSharing/shares/1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({ userId: editor.user.id }),
      })
    ).status,
  ).toBe(403);

  const list = await listDocuments(editor);
  const confidential = list.data.find((document) => document.confidential)!;
  expect(confidential).toBeDefined();
  expect((await editor.fetch(`/documents/${confidential.id}`)).status).toBe(
    200,
  );
});

test('disabling a reader ends an already signed-in session', async ({
  testApp,
}) => {
  const admin = await signInAs(
    testApp,
    DEFAULT_ADMIN_CREDENTIALS.username,
    DEFAULT_ADMIN_CREDENTIALS.password,
  );
  const reader = await signInAs(
    testApp,
    DEMO_USERS.reader.username,
    DEMO_PASSWORD,
  );

  const recipients = await readJson<RecipientList>(
    await admin.fetch('/documentSharing/recipients'),
  );
  const readerUser = recipients.data.find(
    (recipient) => recipient.username === DEMO_USERS.reader.username,
  )!;

  const disabled = await admin.fetch(`/users/${readerUser.id}/disable`, {
    method: 'POST',
    headers: { origin: 'http://localhost' },
  });
  expect(disabled.status).toBe(200);

  expect((await reader.fetch('/documents')).status).toBe(401);
  expect((await reader.fetch('/documentSharing/recipients')).status).toBe(401);
});
