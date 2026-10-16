// @vitest-environment node
import path from 'node:path';
import type {
  DatabaseConnection,
  MigrationSource,
  SeedContext,
  SeedSource,
} from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import seed from '../../database/main/seeds/202610070002_seed_devices.js';

/** A `devices` row, narrowed to what the seed and its assertions read and write. */
interface DeviceRecord {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly status: string;
}

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

// The seed runs once when the application installs, so the file's database already holds DEV-0001 and DEV-0002.
// Isolation `none` keeps those rows across the tests, which is what a repeat run has to leave alone.
const test = createDatabaseTest({ migrations, seeds, isolation: 'none' });

/** The `SeedContext` shape the seed reads from; the connection supplies everything it touches. */
function seedContext(connection: DatabaseConnection): SeedContext {
  return {
    config: {} as SeedContext['config'],
    container: {} as SeedContext['container'],
    query: connection.query,
    connection: connection as unknown as SeedContext['connection'],
    repository: (collection) => connection.repository(collection),
  };
}

test('loads the two starting devices', async ({ connection }) => {
  const devices = connection.repository<DeviceRecord>('devices');
  const rows = await devices.findMany({ orderBy: ['code'] });
  expect(rows.map((row) => [row.code, row.name, row.status])).toEqual([
    ['DEV-0001', 'Dell Latitude 5440', 'available'],
    ['DEV-0002', 'iPad 9', 'borrowed'],
  ]);
});

test('adds nothing on a repeat run', async ({ connection }) => {
  const devices = connection.repository<DeviceRecord>('devices');
  await seed.run(seedContext(connection));
  expect(await devices.count()).toBe(2);
});

test('leaves a device a user has edited untouched on a repeat run', async ({
  connection,
}) => {
  const devices = connection.repository<DeviceRecord>('devices');
  await devices.updateOne({
    filter: { code: 'DEV-0001' },
    values: { name: '会议室投影仪', status: 'borrowed' },
  });

  await seed.run(seedContext(connection));

  expect(await devices.count()).toBe(2);
  const row = await devices.findOne({ filter: { code: 'DEV-0001' } });
  expect(row?.name).toBe('会议室投影仪');
  expect(row?.status).toBe('borrowed');
});
