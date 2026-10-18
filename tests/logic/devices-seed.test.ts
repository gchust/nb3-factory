// @vitest-environment node
import path from 'node:path';

import { createDatabaseTest } from '@nocobase/app-testing/server';
import type { MigrationSource, SeedContext } from '@nocobase/db';
import { expect } from 'vitest';

import seed from '../../database/main/seeds/202610070002_default_devices.ts';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'app-devices-seed-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// Every test gets a fresh schema with the migrations applied, so a test starts from an empty `devices` table.
const test = createDatabaseTest({ migrations: sources });

/**
 * The seed only reads and writes through the connection's query adapter, so that is the whole dependency it needs.
 */
function runSeed(context: { readonly query: SeedContext['query'] }) {
  return seed.run(context as unknown as SeedContext);
}

const DEFAULT_DEVICES = [
  { code: 'DEV-CAM-0002', name: 'Nimbus Cam 4K', status: 'available' },
  { code: 'DEV-LAP-0001', name: 'Aurora Book 14', status: 'borrowed' },
] as const;

test('loads the two default devices on a fresh database', async ({
  connection,
}) => {
  await runSeed({ query: connection.query });

  const rows = await connection.query
    .selectFrom('devices')
    .select(['code', 'name', 'status'])
    .orderBy('code', 'asc')
    .execute();
  expect(rows).toEqual(DEFAULT_DEVICES);
});

test('repeat runs add nothing and never duplicate a device', async ({
  connection,
}) => {
  await runSeed({ query: connection.query });
  await runSeed({ query: connection.query });

  const rows = await connection.query
    .selectFrom('devices')
    .select('id')
    .execute();
  expect(rows).toHaveLength(2);
});

test('leaves a device a user has already edited untouched', async ({
  connection,
}) => {
  // A row with the same code already exists, carrying data the user changed after installation.
  await connection.query
    .insertInto('devices')
    .values({
      code: 'DEV-LAP-0001',
      name: 'Renamed by a user',
      status: 'available',
    })
    .execute();

  await runSeed({ query: connection.query });

  const rows = await connection.query
    .selectFrom('devices')
    .select(['code', 'name', 'status'])
    .orderBy('code', 'asc')
    .execute();
  expect(rows).toEqual([
    { code: 'DEV-CAM-0002', name: 'Nimbus Cam 4K', status: 'available' },
    { code: 'DEV-LAP-0001', name: 'Renamed by a user', status: 'available' },
  ]);
});
