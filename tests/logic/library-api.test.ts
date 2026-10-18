import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost', sampleData: true },
    secrets: {
      keys: [{ version: 1, key: 'a'.repeat(64) }],
    },
  },
});

const PASSWORD = 'Library123!';
const DOCUMENTS = {
  publishedByJia: '2b4a1d5e-7f80-4c91-9d10-3a5b6c7d0001',
  publishedByZhou: '2b4a1d5e-7f80-4c91-9d10-3a5b6c7d0002',
  confidentialByZhou: '2b4a1d5e-7f80-4c91-9d10-3a5b6c7d0003',
  draftByJia: '2b4a1d5e-7f80-4c91-9d10-3a5b6c7d0004',
  draftByLin: '2b4a1d5e-7f80-4c91-9d10-3a5b6c7d0005',
} as const;

interface DocumentBody {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  published: boolean;
  confidential: boolean;
}

interface ListBody {
  data: DocumentBody[];
  meta: { total: number };
}

type Session = Awaited<ReturnType<typeof signIn>>;

/** A signed-in session whose writes carry the application origin, as a browser's would. */
async function signInAsBrowser(
  ...[app, credentials]: Parameters<typeof signIn>
): Promise<Session> {
  const session = await signIn(app, credentials);
  return {
    ...session,
    fetch: (path, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set('origin', 'http://localhost');
      return session.fetch(path, { ...init, headers });
    },
  };
}

async function documentsFor(session: Session): Promise<ListBody> {
  const response = await session.fetch('/library/documents?page=1&pageSize=50');
  expect(response.status).toBe(200);
  return (await response.json()) as ListBody;
}

test('requires a session and declares every library route', async ({
  testApp,
  request,
}) => {
  expect((await request('/library/documents')).status).toBe(401);
  expect((await request('/library/documents', { method: 'POST' })).status).toBe(
    401,
  );
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);
  expect(
    document.paths?.['/api/library/documents/{documentId}/shares']?.put
      ?.operationId,
  ).toBe('setLibraryDocumentShares');
});

test('restricts readers to published, non-confidential documents and their own', async ({
  testApp,
}) => {
  const reader = await signInAsBrowser(testApp, {
    username: 'zhixia.lin',
    password: PASSWORD,
  });
  const list = await documentsFor(reader);
  expect(list.data.map((document) => document.id).sort()).toEqual(
    [
      DOCUMENTS.publishedByJia,
      DOCUMENTS.publishedByZhou,
      DOCUMENTS.draftByLin,
    ].sort(),
  );

  expect(
    (await reader.fetch(`/library/documents/${DOCUMENTS.confidentialByZhou}`))
      .status,
  ).toBe(404);
  expect(
    (await reader.fetch(`/library/documents/${DOCUMENTS.draftByJia}`)).status,
  ).toBe(404);

  expect(
    (
      await reader.fetch('/library/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Readers cannot publish',
          body: 'No create permission.',
          published: true,
          confidential: false,
        }),
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await reader.fetch(`/library/documents/${DOCUMENTS.draftByLin}`, {
        method: 'DELETE',
      })
    ).status,
  ).toBe(403);
});

test('lets a librarian manage own documents and refuses someone else’s', async ({
  testApp,
}) => {
  const librarian = await signInAsBrowser(testApp, {
    username: 'jiahe.chen',
    password: PASSWORD,
  });
  const list = await documentsFor(librarian);
  expect(list.data.map((document) => document.id).sort()).toEqual(
    [
      DOCUMENTS.publishedByJia,
      DOCUMENTS.publishedByZhou,
      DOCUMENTS.draftByJia,
    ].sort(),
  );

  const mine = await librarian.fetch(
    '/library/documents?mine=true&page=1&pageSize=50',
  );
  expect(mine.status).toBe(200);
  expect(
    ((await mine.json()) as ListBody).data
      .map((document) => document.id)
      .sort(),
  ).toEqual([DOCUMENTS.publishedByJia, DOCUMENTS.draftByJia].sort());

  const created = await librarian.fetch('/library/documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: '采购流程说明',
      body: '草稿内容',
      published: false,
      confidential: false,
    }),
  });
  expect(created.status).toBe(201);
  const document = ((await created.json()) as { data: DocumentBody }).data;
  expect(document.ownerId).toBe('1f0f2f1e-6c3b-4f6a-9a2f-2f7d9c1a0001');

  const updated = await librarian.fetch(`/library/documents/${document.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '采购流程说明（已更新）' }),
  });
  expect(updated.status).toBe(200);
  expect(((await updated.json()) as { data: DocumentBody }).data.title).toBe(
    '采购流程说明（已更新）',
  );

  expect(
    (
      await librarian.fetch(`/library/documents/${DOCUMENTS.draftByLin}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Not mine' }),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await librarian.fetch(`/library/documents/${DOCUMENTS.draftByLin}`, {
        method: 'DELETE',
      })
    ).status,
  ).toBe(404);

  // A public document by someone else is readable but not editable, so it cannot be shared on that librarian's behalf.
  expect(
    (await librarian.fetch(`/library/documents/${DOCUMENTS.publishedByZhou}`))
      .status,
  ).toBe(200);
  expect(
    (
      await librarian.fetch(`/library/documents/${DOCUMENTS.publishedByZhou}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Not mine either' }),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await librarian.fetch(
        `/library/documents/${DOCUMENTS.publishedByZhou}/shares`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userIds: ['1f0f2f1e-6c3b-4f6a-9a2f-2f7d9c1a0002'],
          }),
        },
      )
    ).status,
  ).toBe(404);

  expect(
    (
      await librarian.fetch(`/library/documents/${document.id}`, {
        method: 'DELETE',
      })
    ).status,
  ).toBe(204);
  expect(
    (await librarian.fetch(`/library/documents/${document.id}`)).status,
  ).toBe(404);
});

test('refuses to share a confidential document and never exposes one through a stale rule', async ({
  testApp,
}) => {
  const owner = await signInAsBrowser(testApp, {
    username: 'yining.zhou',
    password: PASSWORD,
  });
  const reader = await signInAsBrowser(testApp, {
    username: 'zhixia.lin',
    password: PASSWORD,
  });
  const readerId = '1f0f2f1e-6c3b-4f6a-9a2f-2f7d9c1a0002';

  expect(
    (await reader.fetch(`/library/documents/${DOCUMENTS.confidentialByZhou}`))
      .status,
  ).toBe(404);

  const rejected = await owner.fetch(
    `/library/documents/${DOCUMENTS.confidentialByZhou}/shares`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: [readerId] }),
    },
  );
  expect(rejected.status).toBe(400);
  expect(
    ((await rejected.json()) as { error: { reason: string } }).error.reason,
  ).toBe('LIBRARY_DOCUMENT_NOT_SHAREABLE');
  expect(
    (await reader.fetch(`/library/documents/${DOCUMENTS.confidentialByZhou}`))
      .status,
  ).toBe(404);
  expect(
    (await documentsFor(reader)).data.map((document) => document.id),
  ).not.toContain(DOCUMENTS.confidentialByZhou);

  // An accidental or stale sharing rule is how a confidential document would otherwise leak. Create one directly,
  // as a mistaken grant would, and confirm the API still hides both the record and its body.
  const authorization =
    testApp.application.container.resolve(authorizationToken);
  const key = `test-confidential-share-${Date.now()}`;
  await authorization.sharingRules.create({
    key,
    resource: { type: 'composite', id: 'library.documents' },
    actions: [
      {
        action: 'view',
        scopeKey: 'documents',
        selection: { type: 'records', ids: [DOCUMENTS.confidentialByZhou] },
      },
    ],
    subjects: [{ type: 'user', id: readerId }],
  });
  try {
    const detail = await reader.fetch(
      `/library/documents/${DOCUMENTS.confidentialByZhou}`,
    );
    expect(detail.status).toBe(404);
    expect(
      (await documentsFor(reader)).data.map((document) => document.id),
    ).not.toContain(DOCUMENTS.confidentialByZhou);
  } finally {
    if (await authorization.sharingRules.get(key)) {
      await authorization.sharingRules.delete(key);
    }
  }
});

test('lets an administrator share one ordinary draft and revoke it', async ({
  testApp,
}) => {
  const admin = await signInAsBrowser(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const reader = await signInAsBrowser(testApp, {
    username: 'zhixia.lin',
    password: PASSWORD,
  });
  const readerId = '1f0f2f1e-6c3b-4f6a-9a2f-2f7d9c1a0002';

  expect(
    (await reader.fetch(`/library/documents/${DOCUMENTS.draftByJia}`)).status,
  ).toBe(404);
  expect(
    (await documentsFor(reader)).data.map((document) => document.id),
  ).not.toContain(DOCUMENTS.draftByJia);

  const shared = await admin.fetch(
    `/library/documents/${DOCUMENTS.draftByJia}/shares`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: [readerId] }),
    },
  );
  expect(shared.status).toBe(200);
  expect(
    ((await shared.json()) as { meta: { total: number } }).meta.total,
  ).toBe(1);

  const detail = await reader.fetch(
    `/library/documents/${DOCUMENTS.draftByJia}`,
  );
  expect(detail.status).toBe(200);
  expect(((await detail.json()) as { data: DocumentBody }).data.body).not.toBe(
    '',
  );
  expect(
    (await documentsFor(reader)).data.map((document) => document.id),
  ).toContain(DOCUMENTS.draftByJia);

  const cleared = await admin.fetch(
    `/library/documents/${DOCUMENTS.draftByJia}/shares`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: [] }),
    },
  );
  expect(cleared.status).toBe(200);
  expect(
    (await reader.fetch(`/library/documents/${DOCUMENTS.draftByJia}`)).status,
  ).toBe(404);
  expect(
    (await documentsFor(reader)).data.map((document) => document.id),
  ).not.toContain(DOCUMENTS.draftByJia);
});

test('searches title and body for documents in scope', async ({ testApp }) => {
  const reader = await signInAsBrowser(testApp, {
    username: 'zhixia.lin',
    password: PASSWORD,
  });
  const response = await reader.fetch(
    '/library/documents?q=保密&page=1&pageSize=50',
  );
  expect(response.status).toBe(200);
  const list = (await response.json()) as ListBody;
  expect(list.data).toEqual([]);
  expect(list.meta.total).toBe(0);

  const titled = await reader.fetch(
    '/library/documents?q=采购&page=1&pageSize=50',
  );
  expect(titled.status).toBe(200);
  const found = (await titled.json()) as ListBody;
  expect(found.meta.total).toBe(1);
  expect(found.data.map((document) => document.id)).toEqual([
    DOCUMENTS.draftByLin,
  ]);
});

test('gives an administrator every document and the ability to change one', async ({
  testApp,
}) => {
  const admin = await signInAsBrowser(testApp, DEFAULT_ADMIN_CREDENTIALS);
  // The initial grants are ordinary Permission Sets, so an administrator can review and change them afterwards.
  const setsResponse = await admin.fetch('/authorization/permissionSets');
  expect(setsResponse.status).toBe(200);
  const sets = (await setsResponse.json()) as {
    data: { key: string }[];
  };
  expect(sets.data.map((set) => set.key)).toEqual(
    expect.arrayContaining(['library.librarian', 'library.reader']),
  );

  const list = await documentsFor(admin);
  expect(list.meta.total).toBe(5);
  expect(list.data.map((document) => document.id).sort()).toEqual(
    Object.values(DOCUMENTS).sort(),
  );

  const original = list.data.find(
    (document) => document.id === DOCUMENTS.confidentialByZhou,
  );
  const updated = await admin.fetch(
    `/library/documents/${DOCUMENTS.confidentialByZhou}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '管理员修订的标题' }),
    },
  );
  expect(updated.status).toBe(200);
  expect(((await updated.json()) as { data: DocumentBody }).data.title).toBe(
    '管理员修订的标题',
  );

  const restored = await admin.fetch(
    `/library/documents/${DOCUMENTS.confidentialByZhou}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: original?.title }),
    },
  );
  expect(restored.status).toBe(200);
});
