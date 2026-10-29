// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import { signIn } from '@nocobase/app-plugin-authentication/testing';
import type { SeedContext } from '@nocobase/db';
import { expect } from 'vitest';

import deviceSeed from '../../database/main/seeds/202610200002_seed_devices.js';
import testUserSeed from '../../database/main/seeds/202610200003_seed_test_users.js';
import { createStandaloneServer } from '../../server/standalone.js';

const CREATE_SERVER = { createServer: createStandaloneServer };

const test = createAppTest({
  ...CREATE_SERVER,
  // Starting an application installs every migration and seed, which is the state a deployment has after `db apply`.
  // The file's tests share that state and create their devices under codes of their own.
  scope: 'file',
  config: {
    secrets: {
      keys: [{ version: 1, key: 'device-ledger-test-secret-0123456789' }],
    },
  },
});

const TEST_USER = {
  email: 'wangfang@example.com',
  password: 'Device123!',
} as const;

// A cookie-authenticated write must name a trusted origin. The test application derives `http://localhost` from the
// in-process request, the same origin a browser at the development server sends.
const WRITE_HEADERS = {
  'content-type': 'application/json',
  origin: 'http://localhost',
} as const;

interface DeviceBody {
  id: string;
  code: string;
  name: string;
  status: 'available' | 'borrowed';
  createdAt: string;
  updatedAt: string;
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

test('refuses the device ledger without a session', async ({ request }) => {
  const response = await request('/devices');
  expect(response.status).toBe(401);
});

test('shows both seeded devices to an ordinary signed-in user and filters by status', async ({
  testApp,
}) => {
  const session = await signIn(testApp, TEST_USER);

  const allResponse = await session.fetch('/devices');
  expect(allResponse.status).toBe(200);
  const all = await json<{ data: DeviceBody[] }>(allResponse);
  expect(all.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'DEV-0001',
        name: '会议室投影仪',
        status: 'available',
      }),
      expect.objectContaining({
        code: 'DEV-0002',
        name: '便携式录音笔',
        status: 'borrowed',
      }),
    ]),
  );
  expect(all.data).toHaveLength(2);

  const filteredResponse = await session.fetch('/devices?status=borrowed');
  expect(filteredResponse.status).toBe(200);
  const filtered = await json<{ data: DeviceBody[] }>(filteredResponse);
  expect(filtered.data.map((device) => device.code)).toEqual(['DEV-0002']);
});

test('creates and edits a device, keeping its name exactly as entered', async ({
  testApp,
}) => {
  const session = await signIn(testApp, TEST_USER);

  const createdResponse = await session.fetch('/devices', {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: JSON.stringify({
      code: 'DEV-TEST-01',
      name: '临时录音笔',
      status: 'available',
    }),
  });
  expect(createdResponse.status).toBe(201);
  const created = await json<{ data: DeviceBody }>(createdResponse);
  expect(created.data).toMatchObject({
    code: 'DEV-TEST-01',
    name: '临时录音笔',
    status: 'available',
  });
  expect(created.data.id).toEqual(expect.any(String));

  const updatedResponse = await session.fetch(
    `/devices/${encodeURIComponent(created.data.id)}`,
    {
      method: 'PATCH',
      headers: WRITE_HEADERS,
      body: JSON.stringify({ name: '临时录音笔（备用）', status: 'borrowed' }),
    },
  );
  expect(updatedResponse.status).toBe(200);
  const updated = await json<{ data: DeviceBody }>(updatedResponse);
  expect(updated.data).toMatchObject({
    id: created.data.id,
    code: 'DEV-TEST-01',
    name: '临时录音笔（备用）',
    status: 'borrowed',
  });
});

test('explains a duplicate code and refuses invalid device input', async ({
  testApp,
}) => {
  const session = await signIn(testApp, TEST_USER);

  const duplicateResponse = await session.fetch('/devices', {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: JSON.stringify({
      code: 'DEV-0001',
      name: 'Duplicate',
      status: 'available',
    }),
  });
  expect(duplicateResponse.status).toBe(409);
  const duplicate = await json<{
    error: { reason: string; domain: string };
  }>(duplicateResponse);
  expect(duplicate.error).toMatchObject({
    reason: 'DEVICE_CODE_TAKEN',
    domain: 'devices',
  });

  const missingName = await session.fetch('/devices', {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: JSON.stringify({ code: 'DEV-TEST-02', status: 'available' }),
  });
  expect(missingName.status).toBe(400);

  const unknownField = await session.fetch('/devices', {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: JSON.stringify({
      code: 'DEV-TEST-03',
      name: 'Unknown field',
      status: 'available',
      internal: true,
    }),
  });
  expect(unknownField.status).toBe(400);

  const missing = await session.fetch('/devices/does-not-exist', {
    method: 'PATCH',
    headers: WRITE_HEADERS,
    body: JSON.stringify({ status: 'borrowed' }),
  });
  expect(missing.status).toBe(404);
  const missingBody = await json<{
    error: { reason: string; domain: string };
  }>(missing);
  expect(missingBody.error).toMatchObject({
    reason: 'DEVICE_NOT_FOUND',
    domain: 'devices',
  });

  const heldResponse = await session.fetch('/devices', {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: JSON.stringify({
      code: 'DEV-TEST-04',
      name: 'Rename me',
      status: 'available',
    }),
  });
  expect(heldResponse.status).toBe(201);
  const held = await json<{ data: DeviceBody }>(heldResponse);

  const duplicateUpdate = await session.fetch(
    `/devices/${encodeURIComponent(held.data.id)}`,
    {
      method: 'PATCH',
      headers: WRITE_HEADERS,
      body: JSON.stringify({ code: 'DEV-0002' }),
    },
  );
  expect(duplicateUpdate.status).toBe(409);
  const duplicateUpdateBody = await json<{
    error: { reason: string; domain: string };
  }>(duplicateUpdate);
  expect(duplicateUpdateBody.error).toMatchObject({
    reason: 'DEVICE_CODE_TAKEN',
    domain: 'devices',
  });
});

test('install data can run again without duplicating devices or test users', async ({
  connection,
}) => {
  const repository = ((name: string) =>
    connection.repository(name)) as SeedContext['repository'];
  const seedContext = {
    repository,
    query: connection.query,
  } as SeedContext;

  await deviceSeed.run(seedContext);
  await testUserSeed.run(seedContext);

  const devices = connection.repository('devices');
  expect(await devices.findOne({ filter: { code: 'DEV-0001' } })).toMatchObject(
    { name: '会议室投影仪' },
  );
  expect(await devices.findOne({ filter: { code: 'DEV-0002' } })).toMatchObject(
    { name: '便携式录音笔' },
  );

  const users = await connection.query
    .selectFrom('user')
    .select('email')
    .where('email', 'in', ['wangfang@example.com', 'alex.chen@example.com'])
    .execute();
  expect(users).toHaveLength(2);
});
