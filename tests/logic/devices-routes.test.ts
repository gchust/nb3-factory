// @vitest-environment node
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

// The application signs in and encrypts sessions with this secret; a test supplies what `config.yml` would carry.
process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const ORIGIN = 'http://localhost';

/** A cookie-authenticated write carries the browser's `Origin`, which Better Auth checks. */
function writeInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify(body),
  };
}

// One application serves the whole file, installed with the application's own migrations and seeds. It holds the two
// starting devices; tests that write add their own codes so they never depend on one another's rows. The public origin
// makes the browser origin these tests send a trusted one, as a deployment's `app.publicOrigin` does.
const test = createAppTest({
  createServer: createStandaloneServer,
  config: { app: { publicOrigin: ORIGIN } },
});

test('refuses an anonymous request', async ({ request }) => {
  expect((await request('/devices')).status).toBe(401);
  expect((await request('/devices', writeInit('POST', {}))).status).toBe(401);
});

test('lists the two starting devices to a signed-in user', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/devices');
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: { code: string; name: string; status: string }[];
    meta: { total: number };
  };
  expect(body.meta.total).toBeGreaterThanOrEqual(2);
  const starting = body.data.filter((device) =>
    ['DEV-0001', 'DEV-0002'].includes(device.code),
  );
  expect(starting).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'DEV-0001',
        name: 'Dell Latitude 5440',
        status: 'available',
      }),
      expect.objectContaining({
        code: 'DEV-0002',
        name: 'iPad 9',
        status: 'borrowed',
      }),
    ]),
  );
});

test('filters the list by status', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/devices?status=available');
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: { status: string }[];
  };
  expect(body.data.length).toBeGreaterThan(0);
  expect(body.data.every((device) => device.status === 'available')).toBe(true);
});

test('adds, reads and changes a device under one identity', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const created = await admin.fetch(
    '/devices',
    writeInit('POST', { code: 'DEV-ROUTE-1', name: '会议室投影仪' }),
  );
  expect(created.status).toBe(201);
  const device = ((await created.json()) as { data: { id: string } }).data;
  // Ids travel as strings.
  expect(typeof device.id).toBe('string');

  const read = await admin.fetch(`/devices/${device.id}`);
  expect(read.status).toBe(200);
  const readDevice = ((await read.json()) as { data: { name: string } }).data;
  // A user-entered name is stored and returned unchanged.
  expect(readDevice.name).toBe('会议室投影仪');

  const changed = await admin.fetch(
    `/devices/${device.id}`,
    writeInit('PATCH', { status: 'borrowed' }),
  );
  expect(changed.status).toBe(200);
  const changedDevice = ((await changed.json()) as { data: { status: string } })
    .data;
  expect(changedDevice.status).toBe('borrowed');
});

test('refuses a duplicate code with a reason a client can translate', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const response = await admin.fetch(
    '/devices',
    writeInit('POST', { code: 'DEV-0001', name: 'Another device' }),
  );
  expect(response.status).toBe(409);
  const body = (await response.json()) as { error: { reason: string } };
  expect(body.error.reason).toBe('DEVICE_CODE_TAKEN');

  // The attempted duplicate did not become a second row.
  const list = await admin.fetch('/devices?status=available');
  const rows = ((await list.json()) as { data: { code: string }[] }).data;
  expect(rows.filter((row) => row.code === 'DEV-0001')).toHaveLength(1);
});

test('answers a missing device and a missing field', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const missing = await admin.fetch('/devices/99999999');
  expect(missing.status).toBe(404);
  const missingBody = (await missing.json()) as { error: { reason: string } };
  expect(missingBody.error.reason).toBe('DEVICE_NOT_FOUND');

  // The field validator answers before the service runs.
  const invalid = await admin.fetch(
    '/devices',
    writeInit('POST', { code: 'DEV-ROUTE-2' }),
  );
  expect(invalid.status).toBe(400);
});

test('lets an ordinary signed-in user use the ledger', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const created = await admin.fetch(
    '/users',
    writeInit('POST', {
      name: '普通用户',
      email: 'ordinary@example.com',
      password: 'ordinary-pass-123',
    }),
  );
  expect(created.status).toBe(201);

  const ordinary = await signIn(testApp, {
    email: 'ordinary@example.com',
    password: 'ordinary-pass-123',
  });
  // The ledger needs a session and no further permission, so an ordinary account sees it and may add to it.
  expect((await ordinary.fetch('/devices')).status).toBe(200);
  const added = await ordinary.fetch(
    '/devices',
    writeInit('POST', { code: 'DEV-ROUTE-3', name: 'Ordinary user device' }),
  );
  expect(added.status).toBe(201);
});

test('declares its routes in the API document', async ({ app }) => {
  expect(findUndeclaredApiRoutes(app)).toEqual([]);
  const document = await app.container.resolve(apiDocsToken).getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  const list = document.paths?.['/api/devices']?.get;
  expect(list?.operationId).toBe('listDevices');
  // Authentication only: no permission check, so no 403, and its validators supply the 400.
  expect(Object.keys(list?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '500',
  ]);

  const create = document.paths?.['/api/devices']?.post;
  expect(create?.operationId).toBe('createDevice');
  expect(Object.keys(create?.responses ?? {}).sort()).toEqual([
    '201',
    '400',
    '401',
    '409',
    '500',
  ]);

  expect(document.paths?.['/api/devices/{deviceId}']?.get?.operationId).toBe(
    'getDevice',
  );
  expect(document.paths?.['/api/devices/{deviceId}']?.patch?.operationId).toBe(
    'updateDevice',
  );
});
