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

import { createStandaloneServer } from '../../server/standalone.ts';

/** One application for the file, started the way `pnpm start` starts it, with the application's own migrations and seeds. */
const test = createAppTest({
  createServer: createStandaloneServer,
  // The test config carries no authentication secret; give it one, the way a deployment's config.yml does.
  config: {
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
  server: {
    env: {
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      // A trusted origin for cookie writes; a browser sends it, and without it the authentication middleware refuses.
      APP_PUBLIC_ORIGIN: 'http://localhost',
    },
  },
});

interface DeviceBody {
  readonly data: {
    readonly id: string;
    readonly reference: string;
    readonly name: string;
    readonly status: string;
    readonly remark: string | null;
  };
  readonly error?: { readonly reason?: string };
}

test('protects the device ledger and lets an administrator manage it', async ({
  testApp,
  request,
}) => {
  // Anonymous: the route authenticates on its own.
  expect((await request('/devices')).status).toBe(401);

  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  // A cookie write from an untrusted origin is refused: the route authenticates the caller, it does not turn CSRF off.
  const forgedOrigin = await admin.fetch('/devices', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://evil.example',
    },
    body: JSON.stringify({
      reference: 'DEV-CSRF',
      name: 'Forged',
      status: 'available',
    }),
  });
  expect(forgedOrigin.status).toBe(403);

  // The seed installed two devices, and the list reports the total.
  const listed = await admin.fetch('/devices');
  expect(listed.status).toBe(200);
  const list = (await listed.json()) as {
    data: readonly { reference: string; name: string; status: string }[];
    meta: { total: number };
  };
  expect(list.meta.total).toBeGreaterThanOrEqual(2);
  expect(list.data.map((device) => device.reference)).toEqual(
    expect.arrayContaining(['DEV-0001', 'DEV-0002']),
  );

  // The seeded names and remarks are stored as entered and never translated.
  const portable = list.data.find((device) => device.reference === 'DEV-0001');
  expect(portable?.name).toBe('便携投影仪 / Portable projector');

  // The status filter narrows the list.
  const borrowed = await admin.fetch('/devices?status=borrowed');
  expect(borrowed.status).toBe(200);
  const borrowedList = (await borrowed.json()) as {
    data: readonly { status: string }[];
  };
  expect(
    borrowedList.data.every((device) => device.status === 'borrowed'),
  ).toBe(true);

  const created = await admin.fetch('/devices', {
    method: 'POST',
    // A browser sends Origin on a write; the authentication middleware refuses a cookie write without a trusted one.
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      reference: 'DEV-7001',
      name: '测试设备 / Test device',
      status: 'available',
      remark: '由测试创建 / Created by a test.',
    }),
  });
  expect(created.status).toBe(201);
  const createdBody = (await created.json()) as DeviceBody;
  const id = createdBody.data.id;
  expect(id).toEqual(expect.any(String));

  // The reference is unique: a second create with the same reference is refused, not duplicated.
  const duplicate = await admin.fetch('/devices', {
    method: 'POST',
    // A browser sends Origin on a write; the authentication middleware refuses a cookie write without a trusted one.
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      reference: 'DEV-7001',
      name: 'Duplicate',
      status: 'available',
    }),
  });
  expect(duplicate.status).toBe(409);
  await expect(duplicate.json()).resolves.toMatchObject({
    error: { status: 'ALREADY_EXISTS', reason: 'DEVICE_REFERENCE_TAKEN' },
  });

  // Read one, update it, and read it back.
  const fetched = await admin.fetch(`/devices/${id}`);
  expect(fetched.status).toBe(200);
  const updated = await admin.fetch(`/devices/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ status: 'borrowed', name: '测试设备（已借出）' }),
  });
  expect(updated.status).toBe(200);
  const updatedBody = (await updated.json()) as DeviceBody;
  expect(updatedBody.data.status).toBe('borrowed');
  expect(updatedBody.data.name).toBe('测试设备（已借出）');

  // A missing device is a 404 with the textual reason the client localizes.
  const missing = await admin.fetch('/devices/does-not-exist');
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
  expect(document.paths?.['/api/devices']?.get?.operationId).toBe(
    'listDevices',
  );
  expect(document.paths?.['/api/devices']?.post?.operationId).toBe(
    'createDevice',
  );
  expect(document.paths?.['/api/devices/{deviceId}']?.patch?.operationId).toBe(
    'updateDevice',
  );
});
