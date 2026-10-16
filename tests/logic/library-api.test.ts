// @vitest-environment node
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestApp, type TestApp } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';

import { createStandaloneServer } from '../../server/standalone.js';
import { PUBLIC_DOCUMENT } from '../../database/main/seeds/202610150004_library_documents.js';
import {
  DRAFT_DOCUMENT,
  CONFIDENTIAL_DOCUMENT,
} from '../../database/main/seeds/202610150004_library_documents.js';
import {
  MAINTAINER,
  READER,
} from '../../database/main/seeds/202610150003_library_accounts.js';

/**
 * The acceptance criteria B01–B05, end to end against the application this
 * repository ships: the seeded accounts sign in through the real sign-in route,
 * and every read and write goes through the real authorization pipeline, its
 * persisted Permission Sets, its Sharing Rules and its Restriction Rules.
 *
 * The test asserts on what a reader is *told*: a document it may not read is
 * `404` (it never learns the record exists) and a write it may not make is
 * `403` (the action exists, this identity lacks it). That distinction is a
 * property of the routes, so it is worth pinning.
 */

interface DocumentPayload {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  editable: boolean;
  canShare: boolean;
}

interface ListPayload {
  data: DocumentPayload[];
  meta: { total: number; canCreate: boolean };
}

/**
 * A cookie-authenticated write needs an `Origin` the application trusts, which
 * is what a browser's fetch sends and what the application's CSRF check reads.
 * A browser gets it from the address it loaded, so the application derives it
 * from the request host; a request built by the test harness carries no host
 * header, so the test application is told the origin instead.
 */
const ORIGIN = 'http://localhost';

function write(
  session: TestSession,
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('origin', ORIGIN);
  const { json, ...rest } = init;
  if (json === undefined) {
    return session.fetch(path, { ...rest, headers });
  }
  headers.set('content-type', 'application/json');
  return session.fetch(path, { ...rest, headers, body: JSON.stringify(json) });
}

let app: TestApp;
let admin: TestSession;
let jia: TestSession;
let yi: TestSession;
let readerId: string;

/** The master key the test application encrypts its stored secrets with. */
const TEST_SECRET_KEY =
  '9f2b7c4e1a5d8f3062bd4c7e9a1f5d8b2c6e0a4f7b1d9c3e6a8f0b2d4c6e8a0f';

beforeAll(async () => {
  app = await createTestApp({
    createServer: createStandaloneServer,
    config: {
      secrets: { keys: [{ version: 1, key: TEST_SECRET_KEY }] },
      auth: { trustedOrigins: [ORIGIN] },
    },
  });
  admin = await signIn(app, DEFAULT_ADMIN_CREDENTIALS);
  jia = await signIn(app, {
    username: MAINTAINER.username,
    password: MAINTAINER.password,
  });
  yi = await signIn(app, {
    username: READER.username,
    password: READER.password,
  });

  const users = await admin.fetch('/users?pageSize=100');
  if (users.status !== 200) {
    throw new Error(`Listing users answered ${users.status}.`);
  }
  const payload = (await users.json()) as {
    data: { id: string; username?: string | null }[];
  };
  const reader = payload.data.find((user) => user.username === READER.username);
  if (!reader) {
    throw new Error(`The seeded reader ${READER.username} is missing.`);
  }
  readerId = reader.id;
}, 300_000);

afterAll(async () => {
  await app?.close();
});

async function list(session: TestSession): Promise<ListPayload> {
  const response = await session.fetch('/library/documents?pageSize=100');
  expect(response.status).toBe(200);
  return (await response.json()) as ListPayload;
}

async function read(session: TestSession, id: string): Promise<Response> {
  return session.fetch(`/library/documents/${id}`);
}

function titleOf(payload: ListPayload, id: string): string | undefined {
  return payload.data.find((document) => document.id === id)?.title;
}

describe('B01 读者只读，资料员维护自己的资料', () => {
  test('乙 reads the published document but may not edit it', async () => {
    const visible = await list(yi);
    expect(visible.data.map((document) => document.id)).toEqual([
      PUBLIC_DOCUMENT.id,
    ]);
    expect(visible.meta.canCreate).toBe(false);

    const document = await read(yi, PUBLIC_DOCUMENT.id);
    expect(document.status).toBe(200);
    const body = ((await document.json()) as { data: DocumentPayload }).data;
    expect(body.title).toBe(PUBLIC_DOCUMENT.title);
    expect(body.editable).toBe(false);

    const edit = await write(yi, `/library/documents/${PUBLIC_DOCUMENT.id}`, {
      method: 'PATCH',
      json: { title: '改造后的标题' },
    });
    expect(edit.status).toBe(403);

    const create = await write(yi, '/library/documents', {
      method: 'POST',
      json: { title: '新资料', body: '内容' },
    });
    expect(create.status).toBe(403);
  });

  test('甲 sees the whole library and maintains its own drafts', async () => {
    const visible = await list(jia);
    expect(new Set(visible.data.map((document) => document.id))).toEqual(
      new Set([
        PUBLIC_DOCUMENT.id,
        DRAFT_DOCUMENT.id,
        CONFIDENTIAL_DOCUMENT.id,
      ]),
    );
    expect(visible.meta.canCreate).toBe(true);

    const update = await write(jia, `/library/documents/${DRAFT_DOCUMENT.id}`, {
      method: 'PATCH',
      json: { body: '（草稿，尚未定稿）\n\n更新后的正文。' },
    });
    expect(update.status).toBe(200);
    expect(((await update.json()) as { data: DocumentPayload }).data.body).toBe(
      '（草稿，尚未定稿）\n\n更新后的正文。',
    );

    const detail = await read(jia, CONFIDENTIAL_DOCUMENT.id);
    expect(detail.status).toBe(200);
  });
});

describe('B02 管理员开放单份草稿', () => {
  test('sharing the draft lets 乙 read it, and gives it nothing else', async () => {
    const hidden = await read(yi, DRAFT_DOCUMENT.id);
    expect(hidden.status).toBe(404);

    const share = await write(
      admin,
      `/library/documents/${DRAFT_DOCUMENT.id}/shares`,
      {
        method: 'POST',
        json: { subjectId: readerId, reason: '临时查阅年度计划' },
      },
    );
    expect(share.status).toBe(201);

    const shared = await read(yi, DRAFT_DOCUMENT.id);
    expect(shared.status).toBe(200);
    const body = ((await shared.json()) as { data: DocumentPayload }).data;
    expect(body.title).toBe(DRAFT_DOCUMENT.title);
    // Reading is not editing, and the share widened the read scope only.
    expect(body.editable).toBe(false);

    const edit = await write(yi, `/library/documents/${DRAFT_DOCUMENT.id}`, {
      method: 'PATCH',
      json: { title: '被阅读者改写的标题' },
    });
    expect(edit.status).toBe(403);
    expect((await list(yi)).meta.canCreate).toBe(false);

    // Another draft 甲 creates afterwards stays out of reach.
    const second = await write(jia, '/library/documents', {
      method: 'POST',
      json: { title: '另一份草稿', body: '只属于甲的草稿。' },
    });
    expect(second.status).toBe(201);
    const secondId = ((await second.json()) as { data: DocumentPayload }).data
      .id;
    expect((await read(yi, secondId)).status).toBe(404);
  });
});

describe('B03 撤销开放后读者看不到正文', () => {
  test('revoking the share hides the draft again on the next request', async () => {
    const shares = await admin.fetch(
      `/library/documents/${DRAFT_DOCUMENT.id}/shares`,
    );
    expect(shares.status).toBe(200);
    const rule = (
      (await shares.json()) as {
        data: { key: string }[];
      }
    ).data.at(0);
    expect(rule).toBeDefined();

    const revoke = await write(
      admin,
      `/library/documents/${DRAFT_DOCUMENT.id}/shares/${encodeURIComponent(rule!.key)}`,
      { method: 'DELETE' },
    );
    expect(revoke.status).toBe(204);

    // Opening the old link again, and listing, both re-evaluate the request.
    expect((await read(yi, DRAFT_DOCUMENT.id)).status).toBe(404);
    expect(titleOf(await list(yi), DRAFT_DOCUMENT.id)).toBeUndefined();
  });
});

describe('B04 保密资料即使开放也不可见', () => {
  test('sharing the confidential document does not leak it to 乙', async () => {
    const share = await write(
      admin,
      `/library/documents/${CONFIDENTIAL_DOCUMENT.id}/shares`,
      {
        method: 'POST',
        json: { subjectId: readerId, reason: '故意开放一份保密资料' },
      },
    );
    expect(share.status).toBe(201);

    // The Restriction Rule narrows every grant the reader holds, so the share
    // widens records that the rule then removes again.
    expect((await read(yi, CONFIDENTIAL_DOCUMENT.id)).status).toBe(404);
    expect(titleOf(await list(yi), CONFIDENTIAL_DOCUMENT.id)).toBeUndefined();

    // 甲's access is unaffected: the rule names 乙 alone.
    const maintainer = await read(jia, CONFIDENTIAL_DOCUMENT.id);
    expect(maintainer.status).toBe(200);
    const body = ((await maintainer.json()) as { data: DocumentPayload }).data;
    expect(body.body).toContain('保密');
  });
});

describe('B05 停用账号使会话失效', () => {
  test('a disabled reader loses its session and 甲 is unaffected', async () => {
    const disable = await write(admin, `/users/${readerId}/disable`, {
      method: 'POST',
    });
    expect(disable.status).toBeLessThan(300);

    const afterDisable = await yi.fetch('/library/documents');
    expect(afterDisable.status).toBe(401);

    const maintainer = await list(jia);
    expect(titleOf(maintainer, PUBLIC_DOCUMENT.id)).toBe(PUBLIC_DOCUMENT.title);
    const edit = await write(jia, `/library/documents/${DRAFT_DOCUMENT.id}`, {
      method: 'PATCH',
      json: { body: '停用阅读者后甲仍然可以维护资料。' },
    });
    expect(edit.status).toBe(200);
  });
});
