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

// The application starts the way `pnpm start` starts it, installs its own migrations and seeds, and answers through
// its real routes — which is the only way to prove the ledger is reachable at all. A test needs its own master keys
// because a deployment supplies them in `config.yml` or `SECRETS_KEYS`.
/** The headers a browser sends for a same-origin JSON write. */
const write = {
  'content-type': 'application/json',
  origin: 'http://localhost',
} as const;

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    // The origin a browser sends on a same-origin write; without it the test requests carry no Origin at all and the
    // application's CSRF protection refuses them, exactly as it refuses any other cookie-authenticated write.
    app: { publicOrigin: 'http://localhost' },
    secrets: {
      keys: [
        {
          version: 1,
          key: '5f2d1c0b9a8e7d6c5b4a39281706f5e4d3c2b1a09988776655443322110ffeed',
        },
      ],
    },
  },
});

interface DeviceBody {
  readonly data: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly status: string;
    readonly notes: string | null;
  };
}

interface DeviceListBody {
  readonly data: readonly {
    readonly id: string;
    readonly code: string;
    readonly status: string;
  }[];
  readonly meta: { readonly total: number };
}

test('rejects every device endpoint without a session', async ({ request }) => {
  // The ledger is open to any signed-in user, but a session is still required; both the REST path and the classic
  // resource-action path have to say so on their own.
  for (const path of ['/devices', '/devices:list']) {
    const response = await request(path);
    expect(response.status).toBe(401);
  }
  const create = await request('/devices:create', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({ code: 'DEV-999', name: 'Anonymous' }),
  });
  expect(create.status).toBe(401);
});

test('serves the seeded ledger to a signed-in user', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const listed = await admin.fetch('/devices');
  expect(listed.status).toBe(200);
  const body = (await listed.json()) as DeviceListBody;
  // The seed puts two fictional devices in the ledger, in code order.
  expect(body.meta.total).toBe(2);
  expect(body.data.map((device) => device.code)).toEqual([
    'DEV-001',
    'DEV-002',
  ]);
  expect(body.data.map((device) => device.status)).toEqual([
    'available',
    'borrowed',
  ]);
  // The status filter is applied by the endpoint, not by the browser.
  const available = (await (
    await admin.fetch('/devices?status=available')
  ).json()) as DeviceListBody;
  expect(available.data.map((device) => device.code)).toEqual(['DEV-001']);
  expect(available.meta.total).toBe(1);
  const borrowed = (await (
    await admin.fetch('/devices?status=borrowed')
  ).json()) as DeviceListBody;
  expect(borrowed.data.map((device) => device.code)).toEqual(['DEV-002']);
  // A status that is not one of the two values is refused rather than ignored.
  expect((await admin.fetch('/devices?status=lost')).status).toBe(400);

  // The classic resource-action form answers the same thing.
  const resourceList = (await (
    await admin.fetch('/devices:list')
  ).json()) as DeviceListBody;
  expect(resourceList.meta.total).toBe(2);
});

test('creates, refuses a duplicate code and updates a device', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const created = await admin.fetch('/devices', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      code: 'DEV-900',
      name: '访客笔记本',
      status: 'available',
      notes: '留作备用。',
    }),
  });
  expect(created.status).toBe(201);
  const device = ((await created.json()) as DeviceBody).data;
  expect(device).toMatchObject({
    code: 'DEV-900',
    name: '访客笔记本',
    status: 'available',
    notes: '留作备用。',
  });
  // The name and the notes are returned exactly as they were written, in Chinese, without being translated.
  expect(typeof device.id).toBe('string');

  // A code is taken once.
  const duplicate = await admin.fetch('/devices', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({ code: 'DEV-900', name: 'Second device' }),
  });
  expect(duplicate.status).toBe(409);
  await expect(duplicate.json()).resolves.toMatchObject({
    error: { status: 'ALREADY_EXISTS', reason: 'DEVICE_CODE_TAKEN' },
  });

  // A code and a name are required.
  for (const json of [{ name: 'No code' }, { code: 'DEV-901' }]) {
    const invalid = await admin.fetch('/devices', {
      method: 'POST',
      headers: write,
      body: JSON.stringify(json),
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { status: 'INVALID_ARGUMENT', reason: 'INVALID_INPUT' },
    });
  }

  // Editing the status is what lending a device out does.
  const updated = await admin.fetch(
    `/devices/${encodeURIComponent(device.id)}`,
    {
      method: 'PATCH',
      headers: write,
      body: JSON.stringify({ status: 'borrowed' }),
    },
  );
  expect(updated.status).toBe(200);
  await expect(updated.json()).resolves.toMatchObject({
    data: { id: device.id, status: 'borrowed' },
  });

  // Reusing another device's code on update is refused as well.
  const conflict = await admin.fetch(
    `/devices/${encodeURIComponent(device.id)}`,
    {
      method: 'PATCH',
      headers: write,
      body: JSON.stringify({ code: 'DEV-001' }),
    },
  );
  expect(conflict.status).toBe(409);

  // The classic resource-action paths create and update too.
  const resourceCreated = await admin.fetch('/devices:create', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      values: { code: 'DEV-902', name: 'Resource action' },
    }),
  });
  expect(resourceCreated.status).toBe(201);
  const resourceDevice = ((await resourceCreated.json()) as DeviceBody).data;
  expect(resourceDevice.code).toBe('DEV-902');

  const resourceUpdated = await admin.fetch('/devices:update', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      filter: { id: resourceDevice.id },
      values: { name: 'Resource action, renamed' },
    }),
  });
  expect(resourceUpdated.status).toBe(200);
  await expect(resourceUpdated.json()).resolves.toMatchObject({
    data: { id: resourceDevice.id, name: 'Resource action, renamed' },
  });

  const fetched = await admin.fetch(
    `/devices/${encodeURIComponent(device.id)}`,
  );
  expect(fetched.status).toBe(200);
  // An id that no device has is a 404, not an empty record.
  const missing = await admin.fetch('/devices/999999');
  expect(missing.status).toBe(404);
  await expect(missing.json()).resolves.toMatchObject({
    error: { status: 'NOT_FOUND', reason: 'DEVICE_NOT_FOUND' },
  });
});

test('declares its routes in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  // Each device route is documented under its own operation, with only the statuses it can return: no permission
  // check means no 403, and the 400 comes from its validators rather than a declaration.
  const paths = document.paths ?? {};
  expect(paths['/api/devices']?.get?.operationId).toBe('listDevices');
  expect(
    Object.keys(paths['/api/devices']?.get?.responses ?? {}).sort(),
  ).toEqual(['200', '400', '401', '500']);
  expect(paths['/api/devices']?.post?.operationId).toBe('createDevice');
  expect(
    Object.keys(paths['/api/devices']?.post?.responses ?? {}).sort(),
  ).toEqual(['201', '400', '401', '409', '500']);
  expect(paths['/api/devices/{deviceId}']?.get?.operationId).toBe('getDevice');
  expect(paths['/api/devices/{deviceId}']?.patch?.operationId).toBe(
    'updateDevice',
  );
  expect(paths['/api/devices:list']?.get?.operationId).toBe(
    'listDevicesResource',
  );
  expect(paths['/api/devices:create']?.post?.operationId).toBe(
    'createDeviceResource',
  );
  expect(paths['/api/devices:get']?.get?.operationId).toBe('getDeviceResource');
  expect(paths['/api/devices:update']?.post?.operationId).toBe(
    'updateDeviceResource',
  );
});
