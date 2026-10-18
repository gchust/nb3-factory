// @vitest-environment node
import path from 'node:path';
import {
  createSeeder,
  type MigrationSource,
  type SeedSource,
} from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import {
  DeviceCodeTakenError,
  DeviceNotFoundError,
  DeviceServiceImplementation,
} from '../../server/providers/devices.ts';

const databaseDirectory = path.resolve(
  import.meta.dirname,
  '../../database/main',
);
const migrations: readonly MigrationSource[] = [
  {
    packageName: 'devices-test',
    directory: path.join(databaseDirectory, 'migrations'),
  },
];
const seeds: readonly SeedSource[] = [
  {
    packageName: 'devices-test',
    directory: path.join(databaseDirectory, 'seeds'),
  },
];

// A fresh devices table per test, with no sample data: the tests below seed it
// themselves, the way an install with `app.sampleData` set would.
const test = createDatabaseTest({ migrations });

test('seeds two fictional devices once and never overwrites a later edit', async ({
  database,
}) => {
  const seedOnce = () =>
    createSeeder({ database, sources: seeds, sample: { enabled: true } }).run();

  await seedOnce();
  const service = new DeviceServiceImplementation(database);
  const initial = await service.list({ page: 1, pageSize: 100 });
  expect(initial.total).toBe(2);
  expect(
    initial.items.map(({ code, name, status }) => ({ code, name, status })),
  ).toEqual([
    { code: 'DEV-001', name: '会议室投影仪', status: 'available' },
    { code: 'DEV-002', name: '笔记本电脑', status: 'borrowed' },
  ]);

  // A user edits a seeded device. Re-running the seed must not put the original
  // name back, and must not create a second row for the same code.
  const first = initial.items.find((item) => item.code === 'DEV-001')!;
  await service.update(first.id, { name: '大会议室投影仪' });
  await seedOnce();

  const after = await service.list({ page: 1, pageSize: 100 });
  expect(after.total).toBe(2);
  expect(after.items.find((item) => item.code === 'DEV-001')?.name).toBe(
    '大会议室投影仪',
  );
});

test('filters by status and creates a device', async ({ database }) => {
  const service = new DeviceServiceImplementation(database);
  await service.create({
    code: 'DEV-001',
    name: '会议室投影仪',
    status: 'available',
  });
  await service.create({
    code: 'DEV-002',
    name: '笔记本电脑',
    status: 'borrowed',
  });

  const available = await service.list({
    status: 'available',
    page: 1,
    pageSize: 100,
  });
  expect(available.items.map((item) => item.code)).toEqual(['DEV-001']);

  const borrowed = await service.list({
    status: 'borrowed',
    page: 1,
    pageSize: 100,
  });
  expect(borrowed.items.map((item) => item.code)).toEqual(['DEV-002']);

  const all = await service.list({ page: 1, pageSize: 100 });
  expect(all.total).toBe(2);

  const created = await service.create({
    code: 'DEV-003',
    name: '无线投屏器',
    status: 'available',
  });
  expect(created).toMatchObject({
    code: 'DEV-003',
    name: '无线投屏器',
    status: 'available',
  });
});

test('refuses a duplicate code on create and on update', async ({
  database,
}) => {
  const service = new DeviceServiceImplementation(database);
  const first = await service.create({
    code: 'DEV-001',
    name: '会议室投影仪',
    status: 'available',
  });
  await service.create({
    code: 'DEV-002',
    name: '笔记本电脑',
    status: 'borrowed',
  });

  await expect(
    service.create({ code: 'DEV-001', name: '另一台', status: 'available' }),
  ).rejects.toBeInstanceOf(DeviceCodeTakenError);

  await expect(
    service.update(first.id, { code: 'DEV-002' }),
  ).rejects.toBeInstanceOf(DeviceCodeTakenError);

  // Keeping a device's own code is not a collision.
  await expect(
    service.update(first.id, { code: 'DEV-001' }),
  ).resolves.toMatchObject({ code: 'DEV-001' });
});

test('reads a device and reports one that does not exist', async ({
  database,
}) => {
  const service = new DeviceServiceImplementation(database);
  const device = await service.create({
    code: 'DEV-001',
    name: '会议室投影仪',
    status: 'available',
  });

  await expect(service.get(device.id)).resolves.toMatchObject({
    id: device.id,
    code: 'DEV-001',
  });
  await expect(service.get('999999')).resolves.toBeUndefined();
  // A path segment that cannot be an id is "not found", not a server fault.
  await expect(service.get('not-a-number')).resolves.toBeUndefined();

  const updated = await service.update(device.id, { status: 'borrowed' });
  expect(updated.status).toBe('borrowed');

  await expect(service.update('999999', { name: 'x' })).rejects.toBeInstanceOf(
    DeviceNotFoundError,
  );
});
