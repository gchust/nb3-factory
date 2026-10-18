// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

// Cookie-authenticated writes need a trusted request origin; the test harness serves the app at `localhost`.
const ORIGIN = 'http://localhost';

// One installed application for the file: migrations and seeds run once, and the tests below use its database.
const test = createAppTest({
  createServer: createStandaloneServer,
  install: true,
  config: {
    app: { publicOrigin: ORIGIN },
    // The authentication plugin derives Better Auth's keys from `secrets.keys`; a test secret is enough here.
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    users: {
      initialAdmin: {
        username: 'nocobase',
        email: 'admin@nocobase.com',
        password: 'admin123',
      },
    },
  },
});

type Request = (path: string, init?: RequestInit) => Promise<Response>;

/** Signs the initial administrator in and returns the session cookie for later requests. */
async function signInAsAdmin(request: Request): Promise<string> {
  const response = await request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

test('rejects an anonymous request to the ledger', async ({ request }) => {
  const response = await request('/devices');
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toHaveProperty('error');
});

test('creates, reads, lists and updates devices for a signed-in user', async ({
  request,
}) => {
  const cookie = await signInAsAdmin(request);

  // A fresh install loads no devices: the example data is a sample seed.
  const empty = await request('/devices', { headers: { cookie } });
  expect(empty.status).toBe(200);
  await expect(empty.json()).resolves.toMatchObject({
    data: [],
    meta: { total: 0 },
  });

  const created = await request('/devices', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({
      code: 'T-1001',
      name: '示波器',
      status: 'available',
    }),
  });
  expect(created.status).toBe(201);
  const { data: device } = (await created.json()) as {
    data: { id: string; code: string; name: string; status: string };
  };
  expect(device).toMatchObject({
    code: 'T-1001',
    name: '示波器',
    status: 'available',
  });
  expect(typeof device.id).toBe('string');

  const read = await request(`/devices/${device.id}`, {
    headers: { cookie },
  });
  expect(read.status).toBe(200);
  await expect(read.json()).resolves.toMatchObject({
    data: { id: device.id, code: 'T-1001' },
  });

  const filtered = await request('/devices?status=available', {
    headers: { cookie },
  });
  expect(filtered.status).toBe(200);
  const listed = (await filtered.json()) as {
    data: { code: string }[];
    meta: { total: number };
  };
  expect(listed.meta.total).toBe(1);
  expect(listed.data.map((row) => row.code)).toEqual(['T-1001']);

  const updated = await request(`/devices/${device.id}`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ status: 'borrowed' }),
  });
  expect(updated.status).toBe(200);
  await expect(updated.json()).resolves.toMatchObject({
    data: { id: device.id, status: 'borrowed', name: '示波器' },
  });
});

test('explains an invalid body, a duplicate code and an unknown device', async ({
  request,
}) => {
  const cookie = await signInAsAdmin(request);
  const create = (body: unknown) =>
    request('/devices', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify(body),
    });

  expect(
    (await create({ code: 'T-2001', name: 'A', status: 'available' })).status,
  ).toBe(201);

  const duplicate = await create({
    code: 'T-2001',
    name: 'B',
    status: 'available',
  });
  expect(duplicate.status).toBe(409);
  await expect(duplicate.json()).resolves.toMatchObject({
    error: { reason: 'DEVICE_CODE_TAKEN' },
  });

  // A missing required field is refused by the validator before the service sees it.
  const invalid = await create({ code: 'T-2002', status: 'available' });
  expect(invalid.status).toBe(400);

  const missing = await request('/devices/999999', { headers: { cookie } });
  expect(missing.status).toBe(404);
  await expect(missing.json()).resolves.toMatchObject({
    error: { reason: 'DEVICE_NOT_FOUND' },
  });

  const missingUpdate = await request('/devices/999999', {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ name: 'x' }),
  });
  expect(missingUpdate.status).toBe(404);
});
