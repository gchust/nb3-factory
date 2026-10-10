// @vitest-environment node

import { createAppTest, type TestApp } from '@nocobase/app-testing/server';
import { describe, expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

/**
 * The document library through the real application: the seeded accounts, the
 * real database, and the HTTP routes the pages call. This is the level the
 * acceptance criteria are written at — who may read and write which document,
 * what a temporary share does and does not open, and what a confidential
 * document does when it is shared anyway.
 *
 * The application installs its own migrations and seeds on a database of its
 * own, so the accounts and documents P / D / C exist exactly as they do for a
 * user.
 */
const test = createAppTest({
  createServer: createStandaloneServer,
  scope: 'file',
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

interface SignInResult {
  readonly cookie: string;
  readonly userId: string;
}
async function signIn(app: TestApp, username: string): Promise<SignInResult> {
  const response = await app.request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'admin123' }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  const body = (await response.json()) as { user: { id: string } };
  return { cookie, userId: body.user.id };
}

function authed(cookie: string): RequestInit {
  return { headers: { cookie, origin: 'http://localhost' } };
}

async function listMaterials(
  app: TestApp,
  cookie: string,
): Promise<{ data: { id: string; title: string; canEdit: boolean }[] }> {
  const response = await app.request('/materials', authed(cookie));
  expect(response.status).toBe(200);
  return (await response.json()) as {
    data: { id: string; title: string; canEdit: boolean }[];
  };
}

describe('the document library over HTTP', () => {
  test('denies anonymous access', async ({ testApp }) => {
    const response = await testApp.request('/materials');
    expect(response.status).toBe(401);
  });

  test('registers the document collections with the database', async ({
    testApp,
  }) => {
    // The database explorer and the authorization resource lists read this
    // registry, so the application's own tables have to appear in it.
    const collections = testApp.database.collections();
    expect(await collections.get('materials')).toBeDefined();
    expect(await collections.get('materialShares')).toBeDefined();
  });

  test('lets a reader read the published non-confidential document only', async ({
    testApp,
  }) => {
    const reader = await signIn(testApp, 'yier');
    const admin = await signIn(testApp, 'nocobase');

    const readerList = await listMaterials(testApp, reader.cookie);
    expect(readerList.data.map((material) => material.id)).toEqual([
      'material-public-p',
    ]);
    expect(
      readerList.data.every((material) => material.canEdit === false),
    ).toBe(true);

    // The draft and the confidential document are not even named.
    const adminList = await listMaterials(testApp, admin.cookie);
    expect(adminList.data.map((material) => material.id).sort()).toEqual([
      'material-confidential-c',
      'material-draft-d',
      'material-public-p',
    ]);
  });

  test('does not let a reader edit or create', async ({ testApp }) => {
    const reader = await signIn(testApp, 'yier');
    const update = await testApp.request('/materials/material-public-p', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        cookie: reader.cookie,
      },
      body: JSON.stringify({ title: 'changed' }),
    });
    expect(update.status).toBe(403);

    const create = await testApp.request('/materials', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        cookie: reader.cookie,
      },
      body: JSON.stringify({
        title: 'new',
        content: 'body',
        published: true,
        confidential: false,
      }),
    });
    expect(create.status).toBe(403);
  });

  test('opens one draft to one reader, then revokes it', async ({
    testApp,
  }) => {
    const reader = await signIn(testApp, 'yier');
    const admin = await signIn(testApp, 'nocobase');

    // Before the share the draft is invisible to the reader.
    const before = await testApp.request(
      '/materials/material-draft-d',
      authed(reader.cookie),
    );
    expect(before.status).toBe(404);

    const share = await testApp.request('/materials/material-draft-d/shares', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        cookie: admin.cookie,
      },
      body: JSON.stringify({ userId: reader.userId }),
    });
    expect(share.status).toBe(201);

    // Now readable, but still not editable.
    const opened = await testApp.request(
      '/materials/material-draft-d',
      authed(reader.cookie),
    );
    expect(opened.status).toBe(200);
    const detail = (await opened.json()) as {
      data: { canEdit: boolean; shared: boolean };
    };
    expect(detail.data.canEdit).toBe(false);
    expect(detail.data.shared).toBe(true);

    // Opening one draft did not open the confidential one.
    const confidential = await testApp.request(
      '/materials/material-confidential-c',
      authed(reader.cookie),
    );
    expect(confidential.status).toBe(404);

    // The reader may not revoke the share themselves.
    const forbidden = await testApp.request(
      `/materials/material-draft-d/shares/${reader.userId}`,
      { method: 'DELETE', ...authed(reader.cookie) },
    );
    expect(forbidden.status).toBe(403);

    const revoke = await testApp.request(
      `/materials/material-draft-d/shares/${reader.userId}`,
      { method: 'DELETE', ...authed(admin.cookie) },
    );
    expect(revoke.status).toBe(204);

    const after = await testApp.request(
      '/materials/material-draft-d',
      authed(reader.cookie),
    );
    expect(after.status).toBe(404);
  });

  test('never exposes a confidential document, even when it is shared to the reader', async ({
    testApp,
  }) => {
    const reader = await signIn(testApp, 'yier');
    const admin = await signIn(testApp, 'nocobase');

    const share = await testApp.request(
      '/materials/material-confidential-c/shares',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
          cookie: admin.cookie,
        },
        body: JSON.stringify({ userId: reader.userId }),
      },
    );
    expect(share.status).toBe(201);

    const readerView = await testApp.request(
      '/materials/material-confidential-c',
      authed(reader.cookie),
    );
    expect(readerView.status).toBe(404);

    // The owner keeps access to their own confidential document.
    const owner = await signIn(testApp, 'jia');
    const ownerView = await testApp.request(
      '/materials/material-confidential-c',
      authed(owner.cookie),
    );
    expect(ownerView.status).toBe(200);

    const revoked = await testApp.request(
      `/materials/material-confidential-c/shares/${reader.userId}`,
      { method: 'DELETE', ...authed(admin.cookie) },
    );
    expect(revoked.status).toBe(204);
  });

  test('lets the owner maintain their own document', async ({ testApp }) => {
    const owner = await signIn(testApp, 'jia');
    const create = await testApp.request('/materials', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        cookie: owner.cookie,
      },
      body: JSON.stringify({
        title: '甲的新资料',
        content: '正文',
        published: false,
        confidential: false,
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { data: { id: string } };

    const updated = await testApp.request(`/materials/${created.data.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        cookie: owner.cookie,
      },
      body: JSON.stringify({ published: true }),
    });
    expect(updated.status).toBe(200);
    expect(
      ((await updated.json()) as { data: { published: boolean } }).data
        .published,
    ).toBe(true);

    const removed = await testApp.request(`/materials/${created.data.id}`, {
      method: 'DELETE',
      ...authed(owner.cookie),
    });
    expect(removed.status).toBe(204);
  });

  test('stops a signed-in disabled account from continuing to read', async ({
    testApp,
  }) => {
    const reader = await signIn(testApp, 'yier');
    expect(
      (await testApp.request('/materials', authed(reader.cookie))).status,
    ).toBe(200);

    const admin = await signIn(testApp, 'nocobase');
    const disabled = await testApp.request(`/users/${reader.userId}/disable`, {
      method: 'POST',
      ...authed(admin.cookie),
    });
    expect(disabled.status).toBe(200);

    const after = await testApp.request('/materials', authed(reader.cookie));
    expect(after.status).toBe(401);

    const enabled = await testApp.request(`/users/${reader.userId}/enable`, {
      method: 'POST',
      ...authed(admin.cookie),
    });
    expect(enabled.status).toBe(200);
  });

  test('offers the working roles to user management', async ({ testApp }) => {
    const admin = await signIn(testApp, 'nocobase');
    const response = await testApp.request(
      '/users/options',
      authed(admin.cookie),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        roleScopes: { key: string; options: { value: string }[] }[];
      };
    };
    const scope = body.data.roleScopes.find((item) => item.key === 'app');
    const values = scope?.options.map((option) => option.value) ?? [];
    // The two working roles the administrator adjusts from User management.
    expect(values).toContain('curator');
    expect(values).toContain('reader');
  });
});
