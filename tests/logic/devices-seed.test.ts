// @vitest-environment node
import path from 'node:path';
import type { MigrationSource, SeedContext, SeedSource } from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import devicesSeed from '../../database/main/seeds/202610070001_devices.js';

const directory = path.resolve(import.meta.dirname, '../../database/main');
const sources: readonly MigrationSource[] = [
  {
    packageName: 'devices-test',
    directory: path.join(directory, 'migrations'),
  },
];
const seeds: readonly SeedSource[] = [
  { packageName: 'devices-test', directory: path.join(directory, 'seeds') },
];

const test = createDatabaseTest({ migrations: sources, seeds });

test('seeds two devices with the facts the ledger shows', async ({
  connection,
}) => {
  const rows = await connection
    .repository('devices')
    .findMany({ sort: (sort) => sort.field('code').asc() });
  expect(rows).toMatchObject([
    {
      code: 'DEV-1001',
      name: 'Aurora Projector',
      status: 'available',
    },
    {
      code: 'DEV-1002',
      name: 'Field Camera',
      status: 'borrowed',
    },
  ]);
});

test('is idempotent by code and keeps edits made to a seeded device', async ({
  connection,
}) => {
  const devices = connection.repository('devices');
  await devices.updateOne({
    filter: { code: 'DEV-1001' },
    values: { name: 'Projector renamed by the team' },
  });

  // Run the same seed definition again, as a copied database without its seed history would.
  await devicesSeed.run({
    repository: (collection: string) => connection.repository(collection),
  } as unknown as SeedContext);

  await expect(devices.count()).resolves.toBe(2);
  await expect(
    devices.findOne({ filter: { code: 'DEV-1001' } }),
  ).resolves.toMatchObject({ name: 'Projector renamed by the team' });
});
