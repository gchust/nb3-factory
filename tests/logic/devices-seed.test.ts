// @vitest-environment node
import path from 'node:path';
import type { MigrationSource, SeedSource } from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const migrations: readonly MigrationSource[] = [
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

const test = createDatabaseTest({ migrations });

interface DeviceRecord {
  id: string;
  code: string;
  name: string;
  status: string;
}

test('installs two devices in a fresh ledger', async ({
  connection,
  testDatabase,
}) => {
  await testDatabase.seed(seeds);

  const devices = await connection
    .repository<DeviceRecord>('devices')
    .findMany({ sort: (sort) => sort.field('code').asc() });

  expect(devices).toMatchObject([
    { code: 'DEV-001', name: 'Field camera kit', status: 'available' },
    { code: 'DEV-002', name: 'Portable projector', status: 'borrowed' },
  ]);
});

test('leaves an existing device exactly as the user edited it', async ({
  connection,
  testDatabase,
}) => {
  const repository = connection.repository<DeviceRecord>('devices');
  await repository.createOne({
    values: {
      id: 'device-ledger-001',
      code: 'DEV-001',
      name: 'My renamed camera',
      status: 'borrowed',
    },
  });

  await testDatabase.seed(seeds);

  await expect(
    repository.findOne({ filter: { id: 'device-ledger-001' } }),
  ).resolves.toMatchObject({
    name: 'My renamed camera',
    status: 'borrowed',
  });
  await expect(repository.count()).resolves.toBe(2);
});
