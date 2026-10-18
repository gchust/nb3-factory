// @vitest-environment node
import path from 'node:path';
import { createSeeder, type SeedContext, type SeedSource } from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import sampleDevices from '../../database/main/seeds/202610070101_sample_devices.js';
import {
  createDeviceService,
  DeviceCodeTakenError,
  DeviceNotFoundError,
} from '../../server/providers/devices.js';

const migrations = [
  {
    packageName: 'devices-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const seeds: readonly SeedSource[] = [
  {
    packageName: 'devices-test',
    directory: path.resolve(import.meta.dirname, '../../database/main/seeds'),
  },
];

const test = createDatabaseTest({ migrations, seeds });

test('records the example devices as sample data without loading them', async ({
  database,
  connection,
}) => {
  // Installation runs the seed's bookkeeping but not a sample seed, so a fresh install has an empty ledger.
  const history = await createSeeder({ database, sources: seeds }).history();
  expect(history.map(({ name, status }) => [name, status])).toContainEqual([
    '202610070101_sample_devices',
    'skipped',
  ]);

  const rows = await connection.query
    .selectFrom('devices')
    .selectAll()
    .execute();
  expect(rows).toEqual([]);
});

test('loads two example devices and a second run changes nothing', async ({
  database,
}) => {
  const seeder = createSeeder({ database, sources: seeds });
  const first = await seeder.runSamples();
  expect(first.executed).toContain('202610070101_sample_devices');

  const service = createDeviceService(database);
  const loaded = await service.list({ page: 1, pageSize: 100 });
  expect(loaded.meta.total).toBe(2);
  expect(loaded.data.map((device) => device.code)).toEqual([
    'D-1001',
    'D-1002',
  ]);
  expect(loaded.data.map((device) => device.status)).toEqual([
    'available',
    'borrowed',
  ]);
  expect(loaded.data[0]?.name).toBe('会议室投影仪');

  // Run the seed again directly: its upsert keyed on the unique code is a no-op, so the ledger still holds two rows.
  const context = {
    repository: (collection: string) => database.repository(collection),
  } as unknown as SeedContext;
  await sampleDevices.run(context);
  const again = await service.list({ page: 1, pageSize: 100 });
  expect(again.meta.total).toBe(2);
  expect(again.data[0]?.name).toBe('会议室投影仪');
});

test('creates, reads, lists and updates a device', async ({ database }) => {
  const service = createDeviceService(database);

  const created = await service.create({
    code: 'T-1',
    name: '示波器',
    status: 'available',
  });
  expect(created).toMatchObject({
    code: 'T-1',
    name: '示波器',
    status: 'available',
  });
  expect(typeof created.id).toBe('string');

  await expect(service.get(created.id)).resolves.toMatchObject({
    code: 'T-1',
  });

  const updated = await service.update(created.id, { status: 'borrowed' });
  expect(updated.status).toBe('borrowed');
  // An omitted field keeps its value.
  expect(updated.name).toBe('示波器');
});

test('refuses a duplicate code and an unknown id', async ({ database }) => {
  const service = createDeviceService(database);
  const first = await service.create({
    code: 'DUP',
    name: 'A',
    status: 'available',
  });

  await expect(
    service.create({ code: 'DUP', name: 'B', status: 'borrowed' }),
  ).rejects.toBeInstanceOf(DeviceCodeTakenError);
  await expect(service.get('999999')).rejects.toBeInstanceOf(
    DeviceNotFoundError,
  );
  await expect(service.update('999999', { name: 'x' })).rejects.toBeInstanceOf(
    DeviceNotFoundError,
  );

  // Another device may not take a code this one holds, but this one may keep its own code while editing.
  const second = await service.create({
    code: 'DUP2',
    name: 'C',
    status: 'available',
  });
  await expect(
    service.update(second.id, { code: 'DUP' }),
  ).rejects.toBeInstanceOf(DeviceCodeTakenError);
  await expect(
    service.update(first.id, { code: 'DUP' }),
  ).resolves.toMatchObject({ code: 'DUP', name: 'A' });
});

test('filters by status, searches code or name, and pages', async ({
  database,
}) => {
  const service = createDeviceService(database);
  await service.create({ code: 'D-1001', name: '投影仪', status: 'available' });
  await service.create({
    code: 'D-1002',
    name: '笔记本电脑',
    status: 'borrowed',
  });

  const borrowed = await service.list({
    status: 'borrowed',
    page: 1,
    pageSize: 10,
  });
  expect(borrowed.meta.total).toBe(1);
  expect(borrowed.data.map((device) => device.code)).toEqual(['D-1002']);

  const byCode = await service.list({ q: '1001', page: 1, pageSize: 10 });
  expect(byCode.data.map((device) => device.code)).toEqual(['D-1001']);

  const byName = await service.list({ q: '笔记', page: 1, pageSize: 10 });
  expect(byName.data.map((device) => device.code)).toEqual(['D-1002']);

  const firstPage = await service.list({ page: 1, pageSize: 1 });
  const secondPage = await service.list({ page: 2, pageSize: 1 });
  expect(firstPage.meta).toEqual({ page: 1, pageSize: 1, total: 2 });
  expect(firstPage.data).toHaveLength(1);
  expect(secondPage.data).toHaveLength(1);
  expect(firstPage.data[0]?.id).not.toBe(secondPage.data[0]?.id);
});
