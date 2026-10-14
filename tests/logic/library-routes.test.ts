// @vitest-environment node
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import librarySeed from '../../database/main/seeds/202610200002_library_seed.js';
import { createStandaloneServer } from '../../server/standalone.ts';

const test = createAppTest({
  createServer: createStandaloneServer,
  // The application has no `config.yml` in the repository, so the test writes the master key its sign-in and session
  // keys are derived from. Test-only value: never a deployment key.
  config: {
    // The application has no `config.yml` in the repository, so the test writes the master key its sign-in and session
    // keys are derived from, and the public origin a cookie-authenticated write must match.
    app: { publicOrigin: 'http://localhost' },
    secrets: {
      keys: [
        {
          version: 1,
          key: 'e8467a099a278b07dd4f408bbc7d1175ff826d9581241df87b7b6b6ce8995596',
        },
      ],
    },
  },
});

/**
 * A write as a signed-in person. The authentication plugin refuses a cookie-authenticated write without a trusted
 * origin, exactly as a browser sends one for a same-origin `fetch`; the test supplies it explicitly.
 */
function write(
  session: TestSession,
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<Response> {
  return session.fetch(path, {
    method,
    headers: {
      origin: 'http://localhost',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const JIA = { username: 'jia', password: 'jia123456' };
const YI = { username: 'yiyi', password: 'yi123456' };

interface Material {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly shared: boolean;
  readonly writable: boolean;
  readonly canShare: boolean;
}

async function materials(session: TestSession): Promise<Material[]> {
  const response = await session.fetch('/library/materials');
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: Material[] }).data;
}

function find(materials: readonly Material[], title: string): Material {
  const material = materials.find((candidate) => candidate.title === title);
  expect(material, `material ${title} is visible`).toBeDefined();
  return material!;
}

test('declares its routes in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  const list = document.paths?.['/api/library/materials']?.get;
  expect(list?.operationId).toBe('libraryListMaterials');
  const share =
    document.paths?.['/api/library/materials/{materialId}/shares']?.post;
  expect(share?.operationId).toBe('libraryShareMaterial');
  // An authenticated, permission-checked route: its session, its permission and its own input.
  expect(Object.keys(share?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '403',
    '404',
    '500',
  ]);
});

test('refuses an anonymous caller', async ({ request }) => {
  expect((await request('/library/materials')).status).toBe(401);
  expect((await request('/library/users')).status).toBe(401);
});

test('seeds the three materials and the two accounts as required data', async ({
  connection,
}) => {
  const rows = await connection.query
    .selectFrom('materials')
    .select(['reference', 'title'])
    .execute();
  expect(rows.map((row) => row.reference).sort()).toEqual([
    'material-c',
    'material-d',
    'material-p',
  ]);
  // Required, not sample: it must load on a plain `db apply`. Re-running it neither duplicates a row nor overwrites
  // an edit a person made.
  expect(librarySeed.sample).not.toBe(true);
  await connection.query
    .updateTable('materials')
    .set({ title: '编辑过的标题' })
    .where('reference', '=', 'material-p')
    .execute();
  await librarySeed.run({ query: connection.query } as never);
  const after = await connection.query
    .selectFrom('materials')
    .select(['reference', 'title'])
    .execute();
  expect(after).toHaveLength(3);
  expect(after.find((row) => row.reference === 'material-p')?.title).toBe(
    '编辑过的标题',
  );
  // Put the seeded title back so the rest of the file reads the material it names.
  await connection.query
    .updateTable('materials')
    .set({ title: '公开资料 P' })
    .where('reference', '=', 'material-p')
    .execute();
});

test('reads by role, keeping read permission separate from edit permission', async ({
  testApp,
}) => {
  const jia = await signIn(testApp, JIA);
  const yi = await signIn(testApp, YI);

  // 乙 reads the published, non-confidential material and may not change it.
  const yiMaterials = await materials(yi);
  const p = find(yiMaterials, '公开资料 P');
  expect(p.writable).toBe(false);
  expect(p.canShare).toBe(false);
  expect(
    (
      await write(yi, `/library/materials/${p.id}`, 'PATCH', {
        title: 'changed by reader',
      })
    ).status,
  ).toBe(403);

  // 甲 keeps the library: all three of their materials, all writable.
  const jiaMaterials = await materials(jia);
  expect(jiaMaterials.map((material) => material.title).sort()).toEqual([
    '公开资料 P',
    '内部草稿 D',
    '机密资料 C',
  ]);
  expect(find(jiaMaterials, '内部草稿 D').writable).toBe(true);
  expect(find(jiaMaterials, '公开资料 P').canShare).toBe(false);

  // Nobody but the administrator shares.
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  expect(find(await materials(admin), '公开资料 P').canShare).toBe(true);
});

test('hides an unpublished draft until it is shared, and hides it again when the share is revoked', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const jia = await signIn(testApp, JIA);
  const yi = await signIn(testApp, YI);

  const draft = find(await materials(jia), '内部草稿 D');
  const yiListBefore = await materials(yi);
  expect(yiListBefore.some((material) => material.id === draft.id)).toBe(false);
  expect((await yi.fetch(`/library/materials/${draft.id}`)).status).toBe(404);

  // The administrator shares the one draft with 乙.
  const shared = await write(
    admin,
    `/library/materials/${draft.id}/shares`,
    'POST',
    { userId: yi.user.id },
  );
  expect(shared.status).toBe(200);
  const shareList = (await shared.json()) as { data: { userId: string }[] };
  expect(shareList.data.map((entry) => entry.userId)).toEqual([yi.user.id]);

  // 乙 now reads it — but it stays read-only, and the other draft is still out of reach.
  const yiMaterials = await materials(yi);
  const sharedDraft = find(yiMaterials, '内部草稿 D');
  expect(sharedDraft.body).toContain('内部草稿 D');
  expect(sharedDraft.writable).toBe(false);
  expect(sharedDraft.canShare).toBe(false);
  expect(
    (await write(yi, `/library/materials/${sharedDraft.id}`, 'PATCH')).status,
  ).toBe(403);

  // Revoked: the list no longer carries it and its body is not readable.
  const revoked = await write(
    admin,
    `/library/materials/${draft.id}/shares/${yi.user.id}`,
    'DELETE',
  );
  expect(revoked.status).toBe(200);
  const yiListAfter = await materials(yi);
  expect(yiListAfter.some((material) => material.id === draft.id)).toBe(false);
  const reopened = await yi.fetch(`/library/materials/${draft.id}`);
  expect(reopened.status).toBe(404);
  expect(JSON.stringify(await reopened.json())).not.toContain('内部草稿 D');
});

test('never reveals a confidential material, even when it is shared', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const jia = await signIn(testApp, JIA);
  const yi = await signIn(testApp, YI);

  const confidential = find(await materials(jia), '机密资料 C');
  const shared = await write(
    admin,
    `/library/materials/${confidential.id}/shares`,
    'POST',
    { userId: yi.user.id },
  );
  expect(shared.status).toBe(200);

  // 乙 still cannot see it, and 甲 is unaffected.
  const yiMaterials = await materials(yi);
  expect(yiMaterials.some((material) => material.id === confidential.id)).toBe(
    false,
  );
  expect((await yi.fetch(`/library/materials/${confidential.id}`)).status).toBe(
    404,
  );
  expect(find(await materials(jia), '机密资料 C').published).toBe(true);
  expect(
    (await jia.fetch(`/library/materials/${confidential.id}`)).status,
  ).toBe(200);
});

test('restricts the administration endpoints to the administrator', async ({
  testApp,
}) => {
  const jia = await signIn(testApp, JIA);
  const yi = await signIn(testApp, YI);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  expect((await yi.fetch('/library/users')).status).toBe(403);
  expect((await jia.fetch('/library/users')).status).toBe(403);
  expect(
    (
      await write(yi, `/library/users/${yi.user.id}/role`, 'PUT', {
        role: 'editor',
      })
    ).status,
  ).toBe(403);

  const members = await admin.fetch('/library/users');
  expect(members.status).toBe(200);
  const list = (await members.json()) as {
    data: { userId: string; role: string | null; isAdmin: boolean }[];
  };
  expect(list.data.find((member) => member.userId === yi.user.id)?.role).toBe(
    'reader',
  );

  // The administrator promotes 乙, and 乙 may then keep materials.
  const updated = await write(
    admin,
    `/library/users/${yi.user.id}/role`,
    'PUT',
    { role: 'editor' },
  );
  expect(updated.status).toBe(200);
  expect(((await updated.json()) as { data: { role: string } }).data.role).toBe(
    'editor',
  );
});

test('disabling an account ends its session and leaves the others working', async ({
  testApp,
  request,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const yi = await signIn(testApp, YI);
  const jia = await signIn(testApp, JIA);

  expect((await yi.fetch('/library/materials')).status).toBe(200);
  const disabled = await write(admin, `/users/${yi.user.id}/disable`, 'POST');
  expect(disabled.status).toBe(200);

  expect((await yi.fetch('/library/materials')).status).toBe(401);
  expect((await jia.fetch('/library/materials')).status).toBe(200);
  expect((await request('/library/materials')).status).toBe(401);
});
