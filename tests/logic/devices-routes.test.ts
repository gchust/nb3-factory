// @vitest-environment node
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

// The authentication plugin needs a secret; the application generates one in production but a test must not.
process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

// One application for the file, started the way `pnpm start` starts it, with its migrations and required seeds. The
// public origin matches the origin `createAppTest` builds its request URLs from, so a cookie-authenticated write is
// trusted instead of refused as cross-site.
const test = createAppTest({
  createServer: createStandaloneServer,
  server: { env: { APP_PUBLIC_ORIGIN: 'http://localhost' } },
});

const JSON_HEADERS = {
  'content-type': 'application/json',
  origin: 'http://localhost',
};

test('answers 401 to an anonymous caller on every ledger route', async ({
  request,
}) => {
  const routes = [
    ['GET', '/devices'],
    ['POST', '/devices'],
    ['GET', '/devices/1'],
    ['PATCH', '/devices/1'],
  ] as const;

  for (const [method, path] of routes) {
    const response = await request(path, { method });
    expect(response.status, `${method} ${path}`).toBe(401);
  }
});

// Any signed-in identity may use the ledger: the routes require the session and check no permission set, so an
// authorized caller is any authenticated one and there is no 403 to reach. The API document check at the end of the
// file asserts that absence rather than leaving it implicit.
test('lists the seeded devices for a signed-in user', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const response = await admin.fetch('/devices');
  expect(response.status).toBe(200);

  const body = await response.json();
  const codes = body.data.map((device: { code: string }) => device.code);
  expect(codes).toEqual(
    expect.arrayContaining(['DEV-LAP-0001', 'DEV-CAM-0002']),
  );
  expect(body.meta.total).toBe(body.data.length);
});

test('filters the list by status', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const response = await admin.fetch('/devices?status=borrowed');
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.data.length).toBeGreaterThan(0);
  for (const device of body.data) expect(device.status).toBe('borrowed');
  // The seeded borrowed device is there; the availability filter would not return it.
  expect(body.data.map((device: { code: string }) => device.code)).toContain(
    'DEV-LAP-0001',
  );
});

test('adds a device, then refuses the same code', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const created = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      code: 'T-DUP-1',
      name: 'Duplicate probe',
      status: 'available',
    }),
  });
  expect(created.status).toBe(201);
  const createdBody = await created.json();
  expect(createdBody.data).toMatchObject({
    code: 'T-DUP-1',
    name: 'Duplicate probe',
    status: 'available',
  });
  expect(typeof createdBody.data.id).toBe('string');

  const duplicate = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      code: 'T-DUP-1',
      name: 'Another name',
      status: 'borrowed',
    }),
  });
  expect(duplicate.status).toBe(409);
  const duplicateBody = await duplicate.json();
  expect(duplicateBody.error).toMatchObject({
    status: 'ALREADY_EXISTS',
    reason: 'DEVICE_CODE_TAKEN',
    domain: 'devices',
  });
  // A user sees a sentence, not the internal reason code.
  expect(duplicateBody.error.localizedMessage.message).not.toContain(
    'DEVICE_CODE_TAKEN',
  );
});

test('translates an error into the language the request asked for', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const conflict = async (acceptLanguage: string, code: string) => {
    const first = await admin.fetch('/devices', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ code, name: 'Probe', status: 'available' }),
    });
    expect(first.status).toBe(201);
    const second = await admin.fetch('/devices', {
      method: 'POST',
      headers: { ...JSON_HEADERS, 'accept-language': acceptLanguage },
      body: JSON.stringify({ code, name: 'Probe again', status: 'available' }),
    });
    expect(second.status).toBe(409);
    return (await second.json()).error.localizedMessage;
  };

  const english = await conflict('en-US', 'T-LANG-EN');
  expect(english.locale).toBe('en-US');
  expect(english.message).toMatch(/already exists/u);

  const chinese = await conflict('zh-CN', 'T-LANG-ZH');
  expect(chinese.locale).toBe('zh-CN');
  expect(chinese.message).toContain('已存在');
});

test('rejects an incomplete device with a 400 that names the field', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const response = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    // A device without a name is invalid; the code alone is not enough.
    body: JSON.stringify({ code: 'T-INVALID-1', status: 'available' }),
  });
  expect(response.status).toBe(400);

  const body = await response.json();
  expect(body.error.reason).toBe('INVALID_INPUT');
  expect(
    body.error.fieldViolations.map(
      (violation: { field: string }) => violation.field,
    ),
  ).toContain('name');
});

test('updates a device, reports a missing one, and refuses a duplicate code', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const created = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      code: 'T-UPD-1',
      name: 'Update probe',
      status: 'available',
    }),
  });
  expect(created.status).toBe(201);
  const { id } = (await created.json()).data;

  const updated = await admin.fetch(`/devices/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: 'Update probe renamed', status: 'borrowed' }),
  });
  expect(updated.status).toBe(200);
  expect((await updated.json()).data).toMatchObject({
    code: 'T-UPD-1',
    name: 'Update probe renamed',
    status: 'borrowed',
  });

  const missing = await admin.fetch('/devices/99999999', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: 'Ghost' }),
  });
  expect(missing.status).toBe(404);
  expect((await missing.json()).error.reason).toBe('DEVICE_NOT_FOUND');

  const other = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      code: 'T-UPD-2',
      name: 'Other',
      status: 'available',
    }),
  });
  expect(other.status).toBe(201);
  const otherId = (await other.json()).data.id;

  const duplicate = await admin.fetch(`/devices/${otherId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code: 'T-UPD-1' }),
  });
  expect(duplicate.status).toBe(409);
  expect((await duplicate.json()).error.reason).toBe('DEVICE_CODE_TAKEN');
});

test('declares every ledger route in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);

  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  const list = document.paths?.['/api/devices']?.get;
  expect(list?.operationId).toBe('listDevices');
  expect(Object.keys(list?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '500',
  ]);

  const create = document.paths?.['/api/devices']?.post;
  expect(create?.operationId).toBe('createDevice');
  // No 403: the route checks identity, not a permission set.
  expect(Object.keys(create?.responses ?? {}).sort()).toEqual([
    '201',
    '400',
    '401',
    '409',
    '500',
  ]);

  const read = document.paths?.['/api/devices/{deviceId}']?.get;
  expect(read?.operationId).toBe('getDevice');
  expect(Object.keys(read?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '404',
    '500',
  ]);

  const update = document.paths?.['/api/devices/{deviceId}']?.patch;
  expect(update?.operationId).toBe('updateDevice');
  expect(Object.keys(update?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '404',
    '409',
    '500',
  ]);
});
