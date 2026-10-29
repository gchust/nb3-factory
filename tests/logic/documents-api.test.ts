// @vitest-environment node

import { createTestApp } from '@nocobase/app-testing/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

interface DocumentView {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  ownerName: string;
  published: boolean;
  confidential: boolean;
}

interface ShareView {
  id: string;
  userId: string;
  active: boolean;
  revokedAt: string | null;
}

interface ManagedUserView {
  id: string;
  username: string | null;
  name: string;
  disabledAt: string | null;
}

interface ListResponse<T> {
  data: T[];
  meta: { total: number };
}

interface ItemResponse<T> {
  data: T;
}

const PASSWORD = 'Demo123456!';
let app: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  app = await createTestApp({
    createServer: createStandaloneServer,
    server: { viteDevUrl: false },
    config: {
      secrets: {
        keys: [
          {
            version: 1,
            key: 'documents-integration-test-secret-at-least-32-characters',
          },
        ],
      },
      users: {
        initialAdmin: {
          username: 'nocobase',
          email: 'admin@nocobase.com',
          password: 'admin123',
        },
      },
      auth: {
        emailAndPassword: { enabled: true, autoSignIn: false },
        session: { storeSessionInDatabase: true },
      },
    },
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('document library API', () => {
  it('enforces reading, temporary sharing, revocation, confidentiality and disabling', async () => {
    const anonymous = await app.request('/documents');
    expect(anonymous.status).toBe(401);

    const jiaCookie = await signIn('jia_demo');
    const yiCookie = await signIn('yi_demo');

    const jiaBefore = await listDocuments(jiaCookie);
    expect(titles(jiaBefore)).toEqual(
      expect.arrayContaining(['公开资料 P', '私有草稿 D', '保密资料 C']),
    );
    const p = documentByTitle(jiaBefore, '公开资料 P');
    const d = documentByTitle(jiaBefore, '私有草稿 D');
    const c = documentByTitle(jiaBefore, '保密资料 C');

    // B01: a reader reads published material but cannot edit it or create documents.
    const yiInitial = await listDocuments(yiCookie);
    expect(titles(yiInitial)).toEqual(['公开资料 P']);
    const yiP = await getDocument(yiCookie, p.id);
    expect(yiP.status).toBe(200);
    expect(
      ((await yiP.json()) as ItemResponse<DocumentView>).data.body,
    ).toContain('虚构资料 P');
    expect(
      (
        await patchDocument(yiCookie, p.id, {
          title: p.title,
          body: 'tampered',
          published: true,
          confidential: false,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request('/documents', {
          method: 'POST',
          headers: jsonHeaders(yiCookie),
          body: JSON.stringify({
            title: 'Reader document',
            body: 'not allowed',
            published: false,
            confidential: false,
          }),
        })
      ).status,
    ).toBe(403);

    // 甲 maintains their own material and has another private draft that is never shared.
    const jiaDraft = await createDocument(jiaCookie, {
      title: '甲的其它草稿',
      body: '这份草稿不应因为共享 D 而出现在乙的列表中。',
      published: false,
      confidential: false,
    });
    const jiaEdited = await patchDocument(jiaCookie, p.id, {
      title: p.title,
      body: `${p.body}\n\n甲补充了一句。`,
      published: true,
      confidential: false,
    });
    expect(jiaEdited.status).toBe(200);

    // B02: a reader cannot open a draft until it is opened to them.
    expect((await getDocument(yiCookie, d.id)).status).toBe(404);
    expect((await getDocument(yiCookie, jiaDraft.id)).status).toBe(404);

    const candidates = (await (
      await app.request('/documents/share-candidates', {
        headers: { cookie: jiaCookie },
      })
    ).json()) as ListResponse<{
      id: string;
      username: string | null;
    }>;
    const yi = candidates.data.find(
      (candidate) => candidate.username === 'yi_demo',
    );
    expect(yi).toBeDefined();

    const shared = await app.request(`/documents/${d.id}/shares`, {
      method: 'POST',
      headers: jsonHeaders(jiaCookie),
      body: JSON.stringify({ userId: yi!.id }),
    });
    expect(shared.status).toBe(201);
    const share = ((await shared.json()) as ItemResponse<ShareView>).data;
    expect(share.active).toBe(true);

    const yiShared = await listDocuments(yiCookie);
    expect(titles(yiShared)).toEqual(
      expect.arrayContaining(['公开资料 P', '私有草稿 D']),
    );
    expect(titles(yiShared)).not.toContain('甲的其它草稿');
    expect(titles(yiShared)).not.toContain('保密资料 C');
    const yiD = await getDocument(yiCookie, d.id);
    expect(yiD.status).toBe(200);
    expect(
      ((await yiD.json()) as ItemResponse<DocumentView>).data.body,
    ).toContain('虚构草稿 D');
    expect(
      (
        await patchDocument(yiCookie, d.id, {
          title: d.title,
          body: 'tampered by reader',
          published: false,
          confidential: false,
        })
      ).status,
    ).toBe(403);
    expect((await getDocument(yiCookie, jiaDraft.id)).status).toBe(404);
    expect(
      (
        await app.request(`/documents/${d.id}/shares`, {
          method: 'POST',
          headers: jsonHeaders(yiCookie),
          body: JSON.stringify({ userId: yi!.id }),
        })
      ).status,
    ).toBe(403);

    // B03: revoking removes access on the next read, not only in the current UI.
    const revoked = await app.request(`/documents/${d.id}/shares/${share.id}`, {
      method: 'DELETE',
      headers: {
        cookie: jiaCookie,
        origin: `http://localhost${app.publicBasePath}`,
      },
    });
    expect(revoked.status).toBe(200);
    expect(
      ((await revoked.json()) as ItemResponse<ShareView>).data.active,
    ).toBe(false);
    expect((await getDocument(yiCookie, d.id)).status).toBe(404);
    expect(titles(await listDocuments(yiCookie))).toEqual(['公开资料 P']);

    // B04: confidentiality is checked by the share endpoint and by the read selection.
    const confidentialShare = await app.request(`/documents/${c.id}/shares`, {
      method: 'POST',
      headers: jsonHeaders(jiaCookie),
      body: JSON.stringify({ userId: yi!.id }),
    });
    expect(confidentialShare.status).toBe(400);
    await expect(confidentialShare.json()).resolves.toMatchObject({
      error: { status: 'FAILED_PRECONDITION', reason: 'DOCUMENT_CONFIDENTIAL' },
    });
    expect((await getDocument(yiCookie, c.id)).status).toBe(404);
    expect((await getDocument(jiaCookie, c.id)).status).toBe(200);

    // B05: disabling a reader invalidates their existing session and leaves 甲 untouched.
    const adminCookie = await signIn('nocobase', 'admin123');
    const users = (await (
      await app.request('/users?q=yi_demo', {
        headers: { cookie: adminCookie },
      })
    ).json()) as ListResponse<ManagedUserView>;
    const yiUser = users.data.find((user) => user.username === 'yi_demo');
    expect(yiUser).toBeDefined();
    const disabled = await app.request(`/users/${yiUser!.id}/disable`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        origin: `http://localhost${app.publicBasePath}`,
      },
    });
    expect(disabled.status).toBe(200);

    expect(
      (await app.request('/documents', { headers: { cookie: yiCookie } }))
        .status,
    ).toBe(401);
    expect(
      (
        await app.request('/auth/sign-in/username', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'yi_demo', password: PASSWORD }),
        })
      ).status,
    ).not.toBe(200);

    const jiaAfter = await listDocuments(jiaCookie);
    expect(titles(jiaAfter)).toEqual(
      expect.arrayContaining(['公开资料 P', '保密资料 C', '甲的其它草稿']),
    );
    expect((await getDocument(jiaCookie, c.id)).status).toBe(200);
  }, 120_000);
});

async function signIn(username: string, password = PASSWORD): Promise<string> {
  const response = await app.request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

async function listDocuments(cookie: string): Promise<DocumentView[]> {
  const response = await app.request('/documents', { headers: { cookie } });
  expect(response.status).toBe(200);
  return ((await response.json()) as ListResponse<DocumentView>).data;
}

function documentByTitle(
  documents: readonly DocumentView[],
  title: string,
): DocumentView {
  const document = documents.find((item) => item.title === title);
  if (!document) throw new Error(`Missing document ${title}`);
  return document;
}

function titles(documents: readonly DocumentView[]): string[] {
  return documents.map((document) => document.title).sort();
}

function getDocument(cookie: string, id: string): Promise<Response> {
  return app.request(`/documents/${id}`, { headers: { cookie } });
}

function jsonHeaders(cookie: string): Record<string, string> {
  return {
    cookie,
    'content-type': 'application/json',
    origin: `http://localhost${app.publicBasePath}`,
  };
}

async function createDocument(
  cookie: string,
  input: {
    title: string;
    body: string;
    published: boolean;
    confidential: boolean;
  },
): Promise<DocumentView> {
  const response = await app.request('/documents', {
    method: 'POST',
    headers: jsonHeaders(cookie),
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as ItemResponse<DocumentView>).data;
}

function patchDocument(
  cookie: string,
  id: string,
  input: {
    title: string;
    body: string;
    published: boolean;
    confidential: boolean;
  },
): Promise<Response> {
  return app.request(`/documents/${id}`, {
    method: 'PATCH',
    headers: jsonHeaders(cookie),
    body: JSON.stringify(input),
  });
}
