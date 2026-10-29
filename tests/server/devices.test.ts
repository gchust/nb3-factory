// @vitest-environment node
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { expect } from 'vitest';

import { test } from '../helpers/app.js';

const JSON_HEADERS = {
  'content-type': 'application/json',
  origin: 'http://localhost',
};

test('rejects anonymous reads and writes', async ({ request }) => {
  const list = await request('/devices');
  expect(list.status).toBe(401);
  await expect(list.json()).resolves.toMatchObject({
    error: { status: 'UNAUTHENTICATED' },
  });

  const create = await request('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code: 'ANON-1', name: 'Anonymous device' }),
  });
  expect(create.status).toBe(401);
});

test('lists the seeded devices, filters by status and pages', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const all = await admin.fetch('/devices');
  expect(all.status).toBe(200);
  await expect(all.json()).resolves.toEqual({
    data: [
      {
        id: 'device-ledger-001',
        code: 'DEV-001',
        name: 'Field camera kit',
        status: 'available',
      },
      {
        id: 'device-ledger-002',
        code: 'DEV-002',
        name: 'Portable projector',
        status: 'borrowed',
      },
    ],
    meta: { page: 1, pageSize: 20, total: 2 },
  });

  const available = await admin.fetch('/devices?status=available');
  await expect(available.json()).resolves.toMatchObject({
    data: [{ code: 'DEV-001' }],
    meta: { total: 1 },
  });

  const borrowed = await admin.fetch('/devices?status=borrowed');
  await expect(borrowed.json()).resolves.toMatchObject({
    data: [{ code: 'DEV-002' }],
    meta: { total: 1 },
  });

  const paged = await admin.fetch('/devices?page=2&pageSize=1');
  await expect(paged.json()).resolves.toMatchObject({
    data: [{ code: 'DEV-002' }],
    meta: { page: 2, pageSize: 1, total: 2 },
  });
});

test('adds and edits a device, and refuses a duplicate code', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const created = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      code: 'DEV-100',
      name: 'Handheld scanner',
    }),
  });
  expect(created.status).toBe(201);
  const { data: device } = (await created.json()) as {
    data: { id: string; code: string; name: string; status: string };
  };
  expect(device).toMatchObject({
    code: 'DEV-100',
    name: 'Handheld scanner',
    status: 'available',
  });

  const updated = await admin.fetch(`/devices/${device.id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: 'Handheld scanner v2', status: 'borrowed' }),
  });
  expect(updated.status).toBe(200);
  await expect(updated.json()).resolves.toMatchObject({
    data: {
      id: device.id,
      code: 'DEV-100',
      name: 'Handheld scanner v2',
      status: 'borrowed',
    },
  });

  const persisted = await admin.fetch(`/devices/${device.id}`);
  await expect(persisted.json()).resolves.toMatchObject({
    data: { name: 'Handheld scanner v2', status: 'borrowed' },
  });

  const duplicate = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code: 'DEV-100', name: 'Another scanner' }),
  });
  expect(duplicate.status).toBe(409);
  await expect(duplicate.json()).resolves.toMatchObject({
    error: { status: 'ALREADY_EXISTS', reason: 'DEVICE_CODE_TAKEN' },
  });

  const second = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code: 'DEV-101', name: 'Second scanner' }),
  });
  const { data: secondDevice } = (await second.json()) as {
    data: { id: string };
  };
  const duplicateUpdate = await admin.fetch(`/devices/${secondDevice.id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code: 'DEV-100' }),
  });
  expect(duplicateUpdate.status).toBe(409);
  await expect(duplicateUpdate.json()).resolves.toMatchObject({
    error: { status: 'ALREADY_EXISTS', reason: 'DEVICE_CODE_TAKEN' },
  });
});

test('returns localized-friendly validation and missing-device reasons', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const invalidCreate = await admin.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code: 'DEV-200' }),
  });
  expect(invalidCreate.status).toBe(400);
  await expect(invalidCreate.json()).resolves.toMatchObject({
    error: { status: 'INVALID_ARGUMENT' },
  });

  const emptyUpdate = await admin.fetch('/devices/device-ledger-001', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({}),
  });
  expect(emptyUpdate.status).toBe(400);

  const invalidStatus = await admin.fetch('/devices?status=lost');
  expect(invalidStatus.status).toBe(400);

  const missing = await admin.fetch('/devices/does-not-exist', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: 'Missing' }),
  });
  expect(missing.status).toBe(404);
  await expect(missing.json()).resolves.toMatchObject({
    error: { status: 'NOT_FOUND', reason: 'DEVICE_NOT_FOUND' },
  });
});

test('lets an ordinary signed-in user use the ledger', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const credentials = {
    email: 'device-ledger-member@example.com',
    password: 'test-member-password',
  };
  const createdUser = await admin.fetch('/users', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: 'Ledger member', ...credentials }),
  });
  expect(createdUser.status).toBe(201);

  const member = await signIn(testApp, credentials);
  const list = await member.fetch('/devices?status=available');
  expect(list.status).toBe(200);

  const created = await member.fetch('/devices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code: 'DEV-MEMBER-1', name: 'Member device' }),
  });
  expect(created.status).toBe(201);
  const { data } = (await created.json()) as { data: { id: string } };

  const persisted = await admin.fetch(`/devices/${data.id}`);
  await expect(persisted.json()).resolves.toMatchObject({
    data: { code: 'DEV-MEMBER-1', name: 'Member device' },
  });
});
