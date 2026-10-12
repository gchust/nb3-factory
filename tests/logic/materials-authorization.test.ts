// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';
// Cookie-authenticated writes are refused unless their Origin is trusted. Better Auth's static context does not derive
// that from the incoming request, so the test states the origin it addresses.
process.env.BETTER_AUTH_TRUSTED_ORIGINS ??= 'http://localhost';

const OWNER = { username: 'material_jia', password: 'jia123456' };
const READER = { username: 'material_yi', password: 'yi123456' };
const ADMIN = { username: 'nocobase', password: 'admin123' };

/**
 * Cookie-authenticated writes are rejected without a trusted Origin, so every request carries the same one the test
 * server's API root uses. Without it a permission assertion would pass for the wrong reason: a CSRF refusal is also a
 * `403`.
 */
const ORIGIN = 'http://localhost';

interface Material {
  id: number;
  title: string;
  body: string | null;
  ownerId: string;
  published: boolean;
  confidential: boolean;
}

interface MaterialList {
  data: Material[];
  meta: {
    total: number;
    capabilities: {
      canCreate: boolean;
      canUpdate: boolean;
      canDelete: boolean;
      canShare: boolean;
    };
  };
}

type Request = (path: string, init?: RequestInit) => Promise<Response>;

const test = createAppTest({ createServer: createStandaloneServer });

function api(
  request: Request,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return request(path, {
    ...init,
    headers: { origin: ORIGIN, ...(init.headers ?? {}) },
  });
}

async function signIn(
  request: Request,
  account: { username: string; password: string },
): Promise<string> {
  const response = await api(request, '/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(account),
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

async function listMaterials(
  request: Request,
  cookie: string,
): Promise<MaterialList> {
  const response = await api(request, '/materials?page=1&pageSize=100', {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as MaterialList;
}

async function userIdByUsername(
  database: { query(): { selectFrom(table: string): any } },
  username: string,
): Promise<string> {
  const row = await database
    .query()
    .selectFrom('user')
    .select('id')
    .where('username', '=', username)
    .limit(1)
    .executeTakeFirst();
  return String(row.id);
}

test('refuses anonymous access to materials', async ({ request }) => {
  const response = await api(request, '/materials');
  expect(response.status).toBe(401);
});

test('lets 甲 maintain every own material and 乙 read only the published one', async ({
  request,
}) => {
  const ownerCookie = await signIn(request, OWNER);
  const readerCookie = await signIn(request, READER);

  const ownerList = await listMaterials(request, ownerCookie);
  expect(ownerList.meta.capabilities).toMatchObject({
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  });
  const titles = ownerList.data.map((material) => material.title);
  expect(titles).toEqual(
    expect.arrayContaining(['公开资料 P', '私有草稿 D', '保密资料 C']),
  );

  const readerList = await listMaterials(request, readerCookie);
  expect(readerList.data.map((material) => material.title)).toEqual([
    '公开资料 P',
  ]);
  expect(readerList.meta.capabilities).toMatchObject({
    canCreate: false,
    canUpdate: false,
    canDelete: false,
  });

  const published = readerList.data[0];
  const readable = await api(request, `/materials/${published.id}`, {
    headers: { cookie: readerCookie },
  });
  expect(readable.status).toBe(200);
  expect(((await readable.json()) as { data: Material }).data.body).toContain(
    '公开资料',
  );

  // Reading is not editing: the same record 乙 can open, 乙 cannot change.
  const update = await api(request, `/materials/${published.id}`, {
    method: 'PATCH',
    headers: { cookie: readerCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ title: '被乙修改' }),
  });
  expect(update.status).toBe(403);

  const remove = await api(request, `/materials/${published.id}`, {
    method: 'DELETE',
    headers: { cookie: readerCookie },
  });
  expect(remove.status).toBe(403);

  const create = await api(request, '/materials', {
    method: 'POST',
    headers: { cookie: readerCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ title: '乙创建的资料' }),
  });
  expect(create.status).toBe(403);

  const draft = ownerList.data.find(
    (material) => material.title === '私有草稿 D',
  )!;
  const confidential = ownerList.data.find(
    (material) => material.title === '保密资料 C',
  )!;

  // 甲 keeps reading both of their own hidden materials.
  for (const material of [draft, confidential]) {
    const response = await api(request, `/materials/${material.id}`, {
      headers: { cookie: ownerCookie },
    });
    expect(response.status).toBe(200);
  }

  // 乙 cannot open the draft or the confidential material at all.
  for (const material of [draft, confidential]) {
    const response = await api(request, `/materials/${material.id}`, {
      headers: { cookie: readerCookie },
    });
    expect(response.status).toBe(404);
  }
});

test('lets 甲 edit an own material and an administrator edit any material', async ({
  request,
}) => {
  const ownerCookie = await signIn(request, OWNER);
  const adminCookie = await signIn(request, ADMIN);

  const ownerList = await listMaterials(request, ownerCookie);
  const draft = ownerList.data.find(
    (material) => material.title === '私有草稿 D',
  )!;

  // A partial field update: the body changes and the title stays as it was.
  const updated = await api(request, `/materials/${draft.id}`, {
    method: 'PATCH',
    headers: { cookie: ownerCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ body: '私有草稿 D 的正文（由甲修改）' }),
  });
  expect(updated.status).toBe(200);
  const updatedBody = ((await updated.json()) as { data: Material }).data;
  expect(updatedBody.title).toBe('私有草稿 D');
  expect(updatedBody.body).toBe('私有草稿 D 的正文（由甲修改）');

  // The change persists when the record is read again.
  const reread = await api(request, `/materials/${draft.id}`, {
    headers: { cookie: ownerCookie },
  });
  expect(reread.status).toBe(200);
  expect(((await reread.json()) as { data: Material }).data.body).toBe(
    '私有草稿 D 的正文（由甲修改）',
  );

  // The administrator edits a material they do not own through the same route.
  const adminUpdate = await api(request, `/materials/${draft.id}`, {
    method: 'PATCH',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ title: '私有草稿 D（管理员改）' }),
  });
  expect(adminUpdate.status).toBe(200);
  expect(((await adminUpdate.json()) as { data: Material }).data.title).toBe(
    '私有草稿 D（管理员改）',
  );

  // Restore the seeded values so a re-run of the file starts from the same state.
  const restored = await api(request, `/materials/${draft.id}`, {
    method: 'PATCH',
    headers: { cookie: ownerCookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: '私有草稿 D',
      body: '这是一份尚未发布的草稿，默认只有负责人甲可以查看；管理员可以临时开放给指定的阅读者。',
    }),
  });
  expect(restored.status).toBe(200);
});

test('opens one draft to 乙 temporarily, without granting editing or any other draft', async ({
  request,
  database,
}) => {
  const ownerCookie = await signIn(request, OWNER);
  const readerCookie = await signIn(request, READER);
  const adminCookie = await signIn(request, ADMIN);
  const readerId = await userIdByUsername(database, READER.username);

  const ownerList = await listMaterials(request, ownerCookie);
  const draft = ownerList.data.find(
    (material) => material.title === '私有草稿 D',
  )!;

  // Before sharing, the draft is invisible.
  expect(
    (
      await api(request, `/materials/${draft.id}`, {
        headers: { cookie: readerCookie },
      })
    ).status,
  ).toBe(404);

  const grant = await api(request, `/materials/${draft.id}/shares`, {
    method: 'POST',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ userId: readerId }),
  });
  expect(grant.status).toBe(201);

  const opened = await api(request, `/materials/${draft.id}`, {
    headers: { cookie: readerCookie },
  });
  expect(opened.status).toBe(200);
  expect(((await opened.json()) as { data: Material }).data.body).toContain(
    '尚未发布',
  );

  const afterShare = await listMaterials(request, readerCookie);
  expect(afterShare.data.map((material) => material.title)).toEqual(
    expect.arrayContaining(['公开资料 P', '私有草稿 D']),
  );
  expect(afterShare.data.map((material) => material.title)).not.toContain(
    '保密资料 C',
  );

  // Opening the draft to 乙 gives reading, not editing.
  const update = await api(request, `/materials/${draft.id}`, {
    method: 'PATCH',
    headers: { cookie: readerCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ body: '乙尝试编辑草稿' }),
  });
  expect(update.status).toBe(403);

  // Revoking it takes the draft away again.
  const revoke = await api(
    request,
    `/materials/${draft.id}/shares/${readerId}`,
    {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    },
  );
  expect(revoke.status).toBe(204);

  expect(
    (
      await api(request, `/materials/${draft.id}`, {
        headers: { cookie: readerCookie },
      })
    ).status,
  ).toBe(404);
  const revokedList = await listMaterials(request, readerCookie);
  expect(revokedList.data.map((material) => material.title)).toEqual([
    '公开资料 P',
  ]);
});

test('never shows a confidential material to 乙, even when shared, and leaves 甲 untouched', async ({
  request,
  database,
}) => {
  const ownerCookie = await signIn(request, OWNER);
  const readerCookie = await signIn(request, READER);
  const adminCookie = await signIn(request, ADMIN);
  const readerId = await userIdByUsername(database, READER.username);

  const ownerList = await listMaterials(request, ownerCookie);
  const confidential = ownerList.data.find(
    (material) => material.title === '保密资料 C',
  )!;

  const grant = await api(request, `/materials/${confidential.id}/shares`, {
    method: 'POST',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ userId: readerId }),
  });
  expect(grant.status).toBe(201);

  // The share row names 乙, but the record stays outside what a reader may see.
  expect(
    (
      await api(request, `/materials/${confidential.id}`, {
        headers: { cookie: readerCookie },
      })
    ).status,
  ).toBe(404);
  const readerList = await listMaterials(request, readerCookie);
  expect(readerList.data.map((material) => material.title)).not.toContain(
    '保密资料 C',
  );

  // 甲's own access to the confidential material is unaffected.
  const ownerRead = await api(request, `/materials/${confidential.id}`, {
    headers: { cookie: ownerCookie },
  });
  expect(ownerRead.status).toBe(200);
  expect(
    ((await ownerRead.json()) as { data: Material }).data.confidential,
  ).toBe(true);

  await api(request, `/materials/${confidential.id}/shares/${readerId}`, {
    method: 'DELETE',
    headers: { cookie: adminCookie },
  });
});

test('locks a disabled account out of an existing session without touching 甲', async ({
  request,
  database,
}) => {
  const ownerCookie = await signIn(request, OWNER);
  const readerCookie = await signIn(request, READER);
  const adminCookie = await signIn(request, ADMIN);
  const readerId = await userIdByUsername(database, READER.username);

  // The session works before the account is disabled.
  expect(
    (
      await api(request, '/materials', {
        headers: { cookie: readerCookie },
      })
    ).status,
  ).toBe(200);

  const disabled = await api(request, `/users/${readerId}/disable`, {
    method: 'POST',
    headers: { cookie: adminCookie },
  });
  expect([200, 204]).toContain(disabled.status);

  // The same cookie is refused once the account is disabled, without a fresh sign-in.
  const blocked = await api(request, '/materials', {
    headers: { cookie: readerCookie },
  });
  expect(blocked.status).toBe(401);

  // 甲 is unaffected by the reader's account state.
  expect(
    (
      await api(request, '/materials', {
        headers: { cookie: ownerCookie },
      })
    ).status,
  ).toBe(200);

  // Restore the account so a re-run of the file starts from the same state.
  const enabled = await api(request, `/users/${readerId}/enable`, {
    method: 'POST',
    headers: { cookie: adminCookie },
  });
  expect([200, 204]).toContain(enabled.status);
});
