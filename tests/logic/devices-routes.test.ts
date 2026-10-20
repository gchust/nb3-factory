// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

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
    secrets: { keys: [{ version: 1, key: 'a'.repeat(64) }] },
  },
});
let session: TestSession;

test.beforeAll(async ({ testApp }) => {
  session = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
});

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

test('requires a signed-in user', async ({ request }) => {
  const response = await request('/devices');
  expect(response.status).toBe(401);
});

test('lists the seeded devices sorted by code', async () => {
  const response = await session.fetch('/devices');
  expect(response.status).toBe(200);
  const body = await json<{
    data: { code: string; name: string; status: string }[];
    meta: { total: number; page: number; pageSize: number };
  }>(response);
  expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
  expect(body.data.map(({ code, status }) => ({ code, status }))).toEqual([
    { code: 'DEV-1001', status: 'available' },
    { code: 'DEV-1002', status: 'borrowed' },
  ]);
});

test('filters the list by status', async () => {
  const response = await session.fetch('/devices?status=borrowed');
  expect(response.status).toBe(200);
  const body = await json<{
    data: { code: string }[];
    meta: { total: number };
  }>(response);
  expect(body.meta.total).toBe(1);
  expect(body.data.map((row) => row.code)).toEqual(['DEV-1002']);
});

test('creates, edits, and reports a duplicate code in the app language', async () => {
  const createResponse = await session.fetch('/devices', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({
      code: 'DEV-2001',
      name: 'Studio Microphone',
      status: 'available',
      notes: 'Kept in the recording room.',
    }),
  });
  expect(createResponse.status).toBe(201);
  const created = await json<{
    data: { id: string; code: string; name: string; notes: string | null };
  }>(createResponse);
  expect(created.data).toMatchObject({
    code: 'DEV-2001',
    name: 'Studio Microphone',
    notes: 'Kept in the recording room.',
  });

  const duplicate = await session.fetch('/devices', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({ code: 'DEV-2001', name: 'Another microphone' }),
  });
  expect(duplicate.status).toBe(409);
  const duplicateBody = await json<{
    error: {
      reason?: string;
      localizedMessage?: { message: string };
    };
  }>(duplicate);
  expect(duplicateBody.error.reason).toBe('DEVICE_CODE_TAKEN');
  expect(duplicateBody.error.localizedMessage?.message).toBeTruthy();
  expect(duplicateBody.error.localizedMessage?.message).not.toBe(
    duplicateBody.error.reason,
  );

  const updateResponse = await session.fetch(
    `/devices/${encodeURIComponent(created.data.id)}`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ status: 'borrowed', notes: null }),
    },
  );
  expect(updateResponse.status).toBe(200);
  const updated = await json<{
    data: { code: string; status: string; notes: string | null };
  }>(updateResponse);
  expect(updated.data).toMatchObject({
    code: 'DEV-2001',
    status: 'borrowed',
    notes: null,
  });
});

test('translates a duplicate code into the requested language', async () => {
  const response = await session.fetch('/devices', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'accept-language': 'zh-CN',
    },
    body: JSON.stringify({ code: 'DEV-1001', name: 'Duplicate projector' }),
  });
  expect(response.status).toBe(409);
  const body = await json<{
    error: { localizedMessage?: { locale: string; message: string } };
  }>(response);
  expect(body.error.localizedMessage).toEqual({
    locale: 'zh-CN',
    message: '设备编号“DEV-1001”已被使用。',
  });
});

test('uses the language stored in the session, as the language switcher does', async ({
  testApp,
}) => {
  const chineseSession = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const selected = await chineseSession.fetch('/i18n/locale', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({ locale: 'zh-CN' }),
  });
  expect(selected.status).toBe(200);

  // The application's session cookie is separate from Better Auth's sign-in cookie. A browser stores the new one
  // automatically; the test joins both, as a browser would send them.
  const appSessionCookie = selected.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  const response = await testApp.request('/devices', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      cookie: `${chineseSession.cookie}; ${appSessionCookie}`,
    },
    body: JSON.stringify({ code: 'DEV-1001', name: 'Duplicate projector' }),
  });
  expect(response.status).toBe(409);
  const body = await json<{
    error: { localizedMessage?: { locale: string; message: string } };
  }>(response);
  expect(body.error.localizedMessage).toEqual({
    locale: 'zh-CN',
    message: '设备编号“DEV-1001”已被使用。',
  });
});

test('rejects invalid input and reports a missing device', async () => {
  const invalid = await session.fetch('/devices', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({ code: 'DEV-3001' }),
  });
  expect(invalid.status).toBe(400);

  const missing = await session.fetch('/devices/does-not-exist');
  expect(missing.status).toBe(404);
  const body = await json<{ error: { reason?: string } }>(missing);
  expect(body.error.reason).toBe('DEVICE_NOT_FOUND');

  const missingUpdate = await session.fetch('/devices/does-not-exist', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({ name: 'Missing device' }),
  });
  expect(missingUpdate.status).toBe(404);
});
