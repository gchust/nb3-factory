// @vitest-environment node
import path from 'node:path';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import type { MigrationSource, SeedSource } from '@nocobase/db';
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

interface DeviceRow {
  id: string;
  code: string;
  name: string;
  status: string;
  notes: string | null;
}

const byCode = <T extends { code: string }>(left: T, right: T) =>
  left.code.localeCompare(right.code);

const test = createDatabaseTest({ migrations, isolation: 'none' });

test('installs two devices the ledger starts with', async ({ database }) => {
  const seeder = database.createSeeder({ sources: seeds });
  const result = await seeder.run();
  expect(result.executed).toEqual(['202611010002_seed_devices']);

  const devices = database.repository<DeviceRow>('devices');
  const rows = (await devices.findMany({})).sort(byCode);
  expect(rows).toEqual([
    expect.objectContaining({
      code: 'DEV-1001',
      name: 'ThinkPad T14 Laptop',
      status: 'available',
    }),
    expect.objectContaining({
      code: 'DEV-1002',
      name: 'Epson EB-X06 Projector',
      status: 'borrowed',
    }),
  ]);
});

test('re-running the seed neither duplicates nor overwrites what an operator changed', async ({
  database,
}) => {
  const devices = database.repository<DeviceRow>('devices');
  const seeder = database.createSeeder({ sources: seeds });
  await seeder.run();

  await devices.updateOne({
    filter: { code: 'DEV-1001' },
    values: { name: 'Renamed by an operator', status: 'borrowed' },
  });

  // A second seeder records its runs elsewhere, so the seed really executes again rather than being skipped as an
  // already-executed seed.
  const replayed = database.createSeeder({
    sources: seeds,
    tableName: 'devicesTestSeedHistory',
    lockTableName: 'devicesTestSeedLock',
  });
  expect((await replayed.run()).executed).toEqual([
    '202611010002_seed_devices',
  ]);

  const rows = (await devices.findMany({})).sort(byCode);
  expect(rows.map((row) => [row.code, row.name, row.status])).toEqual([
    ['DEV-1001', 'Renamed by an operator', 'borrowed'],
    ['DEV-1002', 'Epson EB-X06 Projector', 'borrowed'],
  ]);
});
