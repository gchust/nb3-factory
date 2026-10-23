// @vitest-environment node

import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';

import { createStandaloneServer } from '../../server/standalone.js';

const JIA = { email: 'jia@example.com', password: 'Materials123!' };
const YI = { email: 'yi@example.com', password: 'Materials123!' };

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      trustedOrigins: ['http://localhost'],
    },
    users: { initialAdmin: DEFAULT_ADMIN_CREDENTIALS },
  },
});

/** A write carries the trusted origin the session's cookie requires. */
const write = (
  session: TestSession,
  path: string,
  method: string,
  body?: unknown,
): Promise<Response> =>
  session.fetch(path, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const json = async <T>(response: Response): Promise<T> =>
  (await response.json()) as T;

test('keeps the library authorization contract', async ({
  testApp,
  expect,
}) => {
  expect((await testApp.request('/materials')).status).toBe(401);

  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const jia = await signIn(testApp, JIA);
  const yi = await signIn(testApp, YI);

  // 甲 maintains the three materials and sees all of them, the confidential
  // one included.
  const jiaList = await json<{ data: { id: string }[] }>(
    await jia.fetch('/materials'),
  );
  expect(jiaList.data.map((item) => item.id).sort()).toEqual([
    'materials-material-c',
    'materials-material-d',
    'materials-material-p',
  ]);

  // 甲 creates a material of their own; the stored row comes back and is
  // readable by its owner straight away.
  const created = await write(jia, '/materials', 'POST', {
    title: '新建资料 J',
    body: '资料员甲新建的正文',
  });
  expect(created.status).toBe(201);
  const createdRow = await json<{ data: { id: string; ownerId: string } }>(
    created,
  );
  expect(createdRow.data.ownerId).toBe('materials-user-jia');
  expect(
    (
      await json<{ data: { title: string; published: boolean } }>(
        await jia.fetch(`/materials/${createdRow.data.id}`),
      )
    ).data,
  ).toMatchObject({ title: '新建资料 J', published: false });
  // The new draft is 甲's alone: 乙 does not see it.
  expect((await yi.fetch(`/materials/${createdRow.data.id}`)).status).toBe(404);

  // 乙 reads published, non-confidential material only: the draft and the
  // confidential material are invisible.
  const yiList = await json<{ data: { id: string }[] }>(
    await yi.fetch('/materials'),
  );
  expect(yiList.data.map((item) => item.id)).toEqual(['materials-material-p']);
  expect((await yi.fetch('/materials/materials-material-d')).status).toBe(404);
  expect((await yi.fetch('/materials/materials-material-c')).status).toBe(404);

  // Reading does not imply editing: a reader may not write.
  expect(
    (await write(yi, '/materials', 'POST', { title: '伪造资料' })).status,
  ).toBe(403);
  expect(
    (await write(yi, '/materials/materials-material-p', 'DELETE')).status,
  ).toBe(403);
  expect(
    (
      await write(yi, '/materials/materials-material-p', 'PATCH', {
        title: '被篡改',
      })
    ).status,
  ).toBe(403);

  // 甲 may edit their own material, and the change persists.
  const edited = await write(jia, '/materials/materials-material-p', 'PATCH', {
    title: '内部资料 P（修订）',
  });
  expect(edited.status).toBe(200);
  expect(
    (
      await json<{ data: { title: string } }>(
        await yi.fetch('/materials/materials-material-p'),
      )
    ).data.title,
  ).toBe('内部资料 P（修订）');

  // A reader cannot manage shares on their own.
  expect(
    (
      await write(yi, '/materials/materials-material-d/shares', 'POST', {
        userId: 'materials-user-yi',
      })
    ).status,
  ).toBe(403);

  // The administrator opens the draft to 乙; 乙 now reads it, body included.
  const shared = await write(
    admin,
    '/materials/materials-material-d/shares',
    'POST',
    { userId: 'materials-user-yi' },
  );
  expect(shared.status).toBe(201);
  const opened = await json<{ data: { title: string; body: string } }>(
    await yi.fetch('/materials/materials-material-d'),
  );
  expect(opened.data.title).toBe('草稿资料 D');
  expect(opened.data.body).toContain('草稿');
  // The share opens the record to read, not to write.
  expect(
    (
      await write(yi, '/materials/materials-material-d', 'PATCH', {
        title: '读者篡改',
      })
    ).status,
  ).toBe(403);
  // Another draft stays closed: the grant is for one record, not every draft.
  expect((await yi.fetch('/materials/materials-material-c')).status).toBe(404);

  // Sharing the confidential material to 乙 does not open it: the restriction
  // wins over the share, and 甲 keeps their own access.
  await write(admin, '/materials/materials-material-c/shares', 'POST', {
    userId: 'materials-user-yi',
  });
  expect((await yi.fetch('/materials/materials-material-c')).status).toBe(404);
  expect((await jia.fetch('/materials/materials-material-c')).status).toBe(200);
  expect(
    (
      await write(jia, '/materials/materials-material-c', 'PATCH', {
        title: '保密资料 C（修订）',
      })
    ).status,
  ).toBe(200);

  // Revoking takes effect on the reader's next request.
  expect(
    (
      await write(
        admin,
        '/materials/materials-material-d/shares/materials-user-yi',
        'DELETE',
      )
    ).status,
  ).toBe(204);
  expect((await yi.fetch('/materials/materials-material-d')).status).toBe(404);

  // Disabling the account ends its access immediately.
  expect(
    (await write(admin, '/users/materials-user-yi/disable', 'POST')).status,
  ).toBe(200);
  expect((await yi.fetch('/materials')).status).toBe(401);
});
