// @vitest-environment node
import path from 'node:path';

import { createDatabaseTest } from '@nocobase/app-testing/server';
import type { MigrationSource } from '@nocobase/db';
import { expect } from 'vitest';

import {
  createDeviceService,
  DeviceCodeTakenError,
  DeviceNotFoundError,
} from '../../server/providers/devices.ts';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'app-devices-service-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const test = createDatabaseTest({ migrations: sources });

test('creates, reads, lists and updates a device', async ({ database }) => {
  const service = createDeviceService(database);

  const created = await service.create({
    code: 'X-1',
    name: 'Alpha',
    status: 'available',
  });
  expect(created).toMatchObject({
    code: 'X-1',
    name: 'Alpha',
    status: 'available',
  });
  // The id crosses the API boundary as a string, whatever the dialect stores.
  expect(typeof created.id).toBe('string');

  await expect(service.find(Number(created.id))).resolves.toEqual(created);

  const updated = await service.update(Number(created.id), {
    name: 'Alpha 2',
    status: 'borrowed',
  });
  expect(updated).toMatchObject({
    code: 'X-1',
    name: 'Alpha 2',
    status: 'borrowed',
  });

  await expect(service.list()).resolves.toEqual([updated]);
});

test('filters the list by status', async ({ database }) => {
  const service = createDeviceService(database);
  await service.create({ code: 'F-1', name: 'Available', status: 'available' });
  await service.create({ code: 'F-2', name: 'Borrowed', status: 'borrowed' });

  await expect(service.list({ status: 'borrowed' })).resolves.toMatchObject([
    { code: 'F-2' },
  ]);
});

test('refuses a duplicate code on create and on update', async ({
  database,
}) => {
  const service = createDeviceService(database);
  await service.create({ code: 'D-1', name: 'One', status: 'available' });
  const second = await service.create({
    code: 'D-2',
    name: 'Two',
    status: 'available',
  });

  await expect(
    service.create({ code: 'D-1', name: 'Duplicate', status: 'borrowed' }),
  ).rejects.toBeInstanceOf(DeviceCodeTakenError);

  await expect(
    service.update(Number(second.id), { code: 'D-1' }),
  ).rejects.toBeInstanceOf(DeviceCodeTakenError);

  // Keeping its own code is not a conflict.
  await expect(
    service.update(Number(second.id), { code: 'D-2' }),
  ).resolves.toMatchObject({ code: 'D-2' });
});

test('reports a missing device rather than writing it', async ({
  database,
}) => {
  const service = createDeviceService(database);

  await expect(
    service.update(999_999, { name: 'Ghost' }),
  ).rejects.toBeInstanceOf(DeviceNotFoundError);
  await expect(service.find(999_999)).resolves.toBeUndefined();
});
