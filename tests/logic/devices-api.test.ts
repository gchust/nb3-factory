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

import devicesSeed from '../../database/main/seeds/202610070002_seed_devices.ts';
import { createStandaloneServer } from '../../server/standalone.ts';

// The authentication plugin refuses to start without at least one secret key.
process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const test = createAppTest({
  createServer: createStandaloneServer,
  // The authentication plugin trusts this origin for cookie-authenticated writes.
  config: { app: { publicOrigin: 'http://localhost' } },
});

interface DeviceBody {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
}

interface ListBody {
  readonly data: DeviceBody[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

interface ErrorBody {
  readonly error: { readonly reason?: string };
}

// A cookie-authenticated write is accepted only from the application's own origin.
const JSON_HEADERS = {
  'content-type': 'application/json',
  origin: 'http://localhost',
};

test('lists the seeded devices for a signed-in user only', async ({
  request,
  testApp,
}) => {
  // Mounting under /api authenticates nothing: the route installs its own guard.
  const anonymous = await request('/devices');
  expect(anonymous.status).toBe(401);

  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/devices');
  expect(response.status).toBe(200);

  const body = (await response.json()) as ListBody;
  expect(body.meta).toMatchObject({ page: 1, pageSize: 20 });
  expect(body.meta.total).toBeGreaterThanOrEqual(2);
  expect(body.data.map((device) => device.code)).toEqual(
    expect.arrayContaining(['EQ-001', 'EQ-002']),
  );
  // A JSON API returns ids as strings and times as RFC 3339.
  expect(body.data.every((device) => typeof device.id === 'string')).toBe(true);
  const projector = body.data.find((device) => device.code === 'EQ-001');
  expect(projector).toMatchObject({
    status: 'available',
    notes: '存放于三楼行政办公室',
  });
  expect(new Date(projector!.createdAt).toISOString()).toBe(
    projector!.createdAt,
  );

  // The status filter is a system value, not a translated label.
  const filtered = await admin.fetch('/devices?status=borrowed');
  expect(filtered.status).toBe(200);
  const filteredBody = (await filtered.json()) as ListBody;
  expect(filteredBody.data.length).toBeGreaterThan(0);
  expect(
    filteredBody.data.every((device) => device.status === 'borrowed'),
  ).toBe(true);
  expect(filteredBody.data.map((device) => device.code)).not.toContain(
    'EQ-001',
  );

  // Pagination uses the validated query values.
  const paged = await admin.fetch('/devices?page=1&pageSize=1');
  expect(paged.status).toBe(200);
  const pagedBody = (await paged.json()) as ListBody;
  expect(pagedBody.meta).toMatchObject({ page: 1, pageSize: 1 });
  expect(pagedBody.data).toHaveLength(1);
});

test('rejects invalid filters and unknown fields', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  expect((await admin.fetch('/devices?status=lost')).status).toBe(400);
  expect((await admin.fetch('/devices?page=0')).status).toBe(400);

  const response = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      code: 'QA-001',
      name: 'Unknown field',
      status: 'available',
      owner: 'nobody',
    }),
  });
  expect(response.status).toBe(400);
});

test('creates, reads and updates a device', async ({ testApp, request }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  // Every mutating endpoint requires a session as well.
  for (const [path, method] of [
    ['/devices', 'POST'],
    ['/devices/1', 'PATCH'],
  ] as const) {
    const anonymous = await request(path, {
      method,
      headers: JSON_HEADERS,
      body: JSON.stringify({ code: 'ANON-1', name: 'Anonymous' }),
    });
    expect(anonymous.status).toBe(401);
  }

  const created = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      code: '  QA-100  ',
      name: '  测试设备  ',
      status: 'available',
      notes: '   ',
    }),
  });
  expect(created.status).toBe(201);
  const device = ((await created.json()) as { data: DeviceBody }).data;
  expect(device).toMatchObject({
    code: 'QA-100',
    name: '测试设备',
    status: 'available',
    notes: null,
    updatedAt: null,
  });
  expect(device.id).toEqual(expect.any(String));
  expect(new Date(device.createdAt).toISOString()).toBe(device.createdAt);

  const duplicate = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      code: 'QA-100',
      name: 'Duplicate',
      status: 'available',
    }),
  });
  expect(duplicate.status).toBe(409);
  expect(((await duplicate.json()) as ErrorBody).error.reason).toBe(
    'DEVICE_CODE_TAKEN',
  );

  const blankName = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      code: 'QA-101',
      name: '   ',
      status: 'available',
    }),
  });
  expect(blankName.status).toBe(400);

  const one = await admin.fetch(`/devices/${device.id}`);
  expect(one.status).toBe(200);
  expect(((await one.json()) as { data: DeviceBody }).data.code).toBe('QA-100');

  const updated = await admin.fetch(`/devices/${device.id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      name: '测试设备（借出）',
      status: 'borrowed',
      notes: '借给设计部',
    }),
  });
  expect(updated.status).toBe(200);
  const updatedDevice = ((await updated.json()) as { data: DeviceBody }).data;
  expect(updatedDevice).toMatchObject({
    id: device.id,
    code: 'QA-100',
    name: '测试设备（借出）',
    status: 'borrowed',
    notes: '借给设计部',
  });
  expect(updatedDevice.createdAt).toBe(device.createdAt);
  expect(updatedDevice.updatedAt).not.toBeNull();

  // Clearing an optional note stores null, not an empty string.
  const cleared = await admin.fetch(`/devices/${device.id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ notes: '   ' }),
  });
  expect(cleared.status).toBe(200);
  expect(
    ((await cleared.json()) as { data: DeviceBody }).data.notes,
  ).toBeNull();

  // The code stays unique across devices, including on update.
  const taken = await admin.fetch(`/devices/${device.id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code: 'EQ-001' }),
  });
  expect(taken.status).toBe(409);
  expect(((await taken.json()) as ErrorBody).error.reason).toBe(
    'DEVICE_CODE_TAKEN',
  );

  const missing = await admin.fetch('/devices/999999');
  expect(missing.status).toBe(404);
  expect(((await missing.json()) as ErrorBody).error.reason).toBe(
    'DEVICE_NOT_FOUND',
  );

  const nonNumeric = await admin.fetch('/devices/not-a-number');
  expect(nonNumeric.status).toBe(404);

  const missingUpdate = await admin.fetch('/devices/999999', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: 'Missing' }),
  });
  expect(missingUpdate.status).toBe(404);
});

test('running the seed again does not duplicate or overwrite devices', async ({
  testApp,
}) => {
  // The application's start already ran the seed once. A second and third run must be harmless.
  const context = {
    repository: (name: string) => testApp.database.repository(name),
  } as unknown as Parameters<typeof devicesSeed.run>[0];

  await devicesSeed.run(context);
  await devicesSeed.run(context);

  const devices = testApp.database.repository('devices');
  const seeded = await devices.findMany({
    filter: (filter) =>
      filter.or([
        filter.string('code').eq('EQ-001'),
        filter.string('code').eq('EQ-002'),
      ]),
  });

  expect(seeded).toHaveLength(2);
  // Repeating the seed keeps edits the user made to a seeded device.
  await devices.updateOne({
    filter: { code: 'EQ-001' },
    values: { name: '用户改过的名称' },
  });
  await devicesSeed.run(context);
  const after = await devices.findOne({ filter: { code: 'EQ-001' } });
  expect(after?.name).toBe('用户改过的名称');
});

test('declares its routes in the API document', async ({ testApp }) => {
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
  expect(Object.keys(create?.responses ?? {}).sort()).toEqual([
    '201',
    '400',
    '401',
    '409',
    '500',
  ]);

  const one = document.paths?.['/api/devices/{deviceId}']?.get;
  expect(one?.operationId).toBe('getDevice');
  expect(Object.keys(one?.responses ?? {}).sort()).toEqual([
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
