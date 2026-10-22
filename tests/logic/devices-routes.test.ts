// @vitest-environment node
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  // Each case writes devices of its own, so every case starts on a database the application installed from scratch.
  scope: 'test',
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      trustedOrigins: ['http://localhost'],
    },
    users: { initialAdmin: DEFAULT_ADMIN_CREDENTIALS },
  },
});

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'http://localhost' },
  body: JSON.stringify(body),
});

const patch = (body: unknown): RequestInit => ({
  ...json(body),
  method: 'PATCH',
});

interface DeviceBody {
  data: { id: string; code: string; name: string; status: string };
}

test('answers 401 without a session', async ({ request }) => {
  const response = await request('/devices');

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    error: { status: 'UNAUTHENTICATED' },
  });
});

test('lists the devices the application is installed with', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/devices?pageSize=100');

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    data: expect.arrayContaining([
      expect.objectContaining({ code: 'DEV-1001', status: 'available' }),
      expect.objectContaining({ code: 'DEV-1002', status: 'borrowed' }),
    ]),
    meta: { page: 1, pageSize: 100 },
  });
});

test('lets an ordinary signed-in user read, create, filter and edit devices', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const credentials = {
    email: 'device-member@example.com',
    password: 'test-member-password',
  };
  const created = await admin.fetch(
    '/users',
    json({ name: 'Device member', ...credentials }),
  );
  expect(created.status).toBe(201);

  const member = await signIn(testApp, credentials);

  const list = await member.fetch('/devices');
  expect(list.status).toBe(200);

  const post = await member.fetch(
    '/devices',
    json({ code: 'DEV-2010', name: 'Borrowed tablet', status: 'borrowed' }),
  );
  expect(post.status).toBe(201);
  const body = (await post.json()) as DeviceBody;
  expect(body.data).toMatchObject({
    code: 'DEV-2010',
    name: 'Borrowed tablet',
    status: 'borrowed',
  });
  expect(typeof body.data.id).toBe('string');

  const filtered = await member.fetch('/devices?status=borrowed');
  expect(filtered.status).toBe(200);
  const filteredBody = (await filtered.json()) as {
    data: { code: string; status: string }[];
  };
  expect(filteredBody.data.map((device) => device.code)).toEqual(
    expect.arrayContaining(['DEV-1002', 'DEV-2010']),
  );
  expect(filteredBody.data).toEqual(
    filteredBody.data.filter((device) => device.status === 'borrowed'),
  );

  const edited = await member.fetch(
    `/devices/${body.data.id}`,
    patch({ name: 'Tablet returned', status: 'available' }),
  );
  expect(edited.status).toBe(200);
  await expect(edited.json()).resolves.toMatchObject({
    data: { id: body.data.id, name: 'Tablet returned', status: 'available' },
  });

  const reread = await member.fetch('/devices?status=available');
  const rereadBody = (await reread.json()) as { data: { code: string }[] };
  expect(rereadBody.data.map((device) => device.code)).toContain('DEV-2010');
});

test('rejects an invalid device with a localized description of each field', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/devices', json({ code: '', name: '' }));

  expect(response.status).toBe(400);
  const body = (await response.json()) as {
    error: { status: string; fieldViolations?: { field: string }[] };
  };
  expect(body.error.status).toBe('INVALID_ARGUMENT');
  expect(
    body.error.fieldViolations?.map((violation) => violation.field),
  ).toEqual(expect.arrayContaining(['code', 'name']));
});

test('answers 409 for a code another device already uses, in the request language', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch(
    '/devices',
    json({ code: 'DEV-1001', name: 'Duplicate code' }),
  );

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({
    error: {
      status: 'ALREADY_EXISTS',
      reason: 'DEVICE_CODE_TAKEN',
      domain: 'devices',
      localizedMessage: {
        locale: 'en-US',
        message: 'A device with code DEV-1001 already exists.',
      },
    },
  });
});

test('answers the failure in the language of the request', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/devices', {
    ...json({ code: 'DEV-1001', name: 'Duplicate code' }),
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'accept-language': 'zh-CN',
    },
  });

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({
    error: {
      reason: 'DEVICE_CODE_TAKEN',
      localizedMessage: {
        locale: 'zh-CN',
        message: '编号为 DEV-1001 的设备已存在。',
      },
    },
  });
});

test('answers 404 for a device that does not exist', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch(
    '/devices/not-a-device',
    patch({ name: 'Nothing' }),
  );

  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toMatchObject({
    error: { status: 'NOT_FOUND', reason: 'DEVICE_NOT_FOUND' },
  });
});
