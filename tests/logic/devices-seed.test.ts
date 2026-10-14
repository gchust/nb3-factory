// @vitest-environment node
import path from 'node:path';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import {
  createSeeder,
  type MigrationSource,
  type SeedSource,
} from '@nocobase/db';
import { expect } from 'vitest';

const packageName = 'devices-test';
const migrations: readonly MigrationSource[] = [
  {
    packageName,
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];
const seeds: readonly SeedSource[] = [
  {
    packageName,
    directory: path.resolve(import.meta.dirname, '../../database/main/seeds'),
  },
];

// The seed is run explicitly, not by the fixture, so the same definitions can be run more than once.
const test = createDatabaseTest({ migrations });

interface DeviceRecord {
  readonly id: string;
  readonly reference: string;
  readonly name: string;
  readonly status: string;
  readonly remark: string | null;
}

test('installs the two devices and stays idempotent', async ({ database }) => {
  const devices = database.repository<DeviceRecord>('devices');

  // A ledger with its own history table, so this run executes the seed for real.
  await createSeeder({
    database,
    sources: seeds,
    tableName: 'seed_history_first',
  }).run();

  const first = await devices.findMany({
    sort: (sort) => sort.field('reference').asc(),
  });
  expect(first.map((device) => device.reference)).toEqual([
    'DEV-0001',
    'DEV-0002',
  ]);
  expect(first[0]).toMatchObject({
    status: 'available',
    name: '便携投影仪 / Portable projector',
  });
  expect(first[1]).toMatchObject({
    status: 'borrowed',
    name: '降噪耳机 / Noise-cancelling headphones',
  });

  // A second run against data that already exists: another history table makes the seeder execute the definitions
  // again instead of skipping them, which is what proves the seed itself is idempotent.
  const extraId = 'existing-device';
  await devices.createOne({
    values: {
      id: extraId,
      reference: 'DEV-9000',
      name: 'Existing device',
      status: 'available',
      remark: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  await createSeeder({
    database,
    sources: seeds,
    tableName: 'seed_history_second',
  }).run();

  const second = await devices.findMany({
    sort: (sort) => sort.field('reference').asc(),
  });
  // No duplicates, and the record that was there before is untouched.
  expect(second.map((device) => device.reference)).toEqual([
    'DEV-0001',
    'DEV-0002',
    'DEV-9000',
  ]);
  expect(second.find((device) => device.id === extraId)?.name).toBe(
    'Existing device',
  );
});
