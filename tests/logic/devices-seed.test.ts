// @vitest-environment node
import path from 'node:path';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import type { MigrationSource, SeedContext } from '@nocobase/db';
import { expect } from 'vitest';

import deviceSeed from '../../database/main/seeds/202610200002_seed_devices.js';

const migrations: readonly MigrationSource[] = [
  {
    packageName: 'device-ledger-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const test = createDatabaseTest({ migrations });

test('adds the two ledger devices once and never overwrites edited data', async ({
  database,
}) => {
  const repository = ((name: string) =>
    database.repository(name)) as SeedContext['repository'];
  const context = { repository } as SeedContext;

  await deviceSeed.run(context);
  await deviceSeed.run(context);

  const devices = database.repository('devices');
  expect(await devices.count()).toBe(2);
  expect(
    await devices.findMany({ sort: (sort) => sort.field('code').asc() }),
  ).toEqual([
    expect.objectContaining({
      code: 'DEV-0001',
      name: '会议室投影仪',
      status: 'available',
    }),
    expect.objectContaining({
      code: 'DEV-0002',
      name: '便携式录音笔',
      status: 'borrowed',
    }),
  ]);

  await devices.updateOne({
    filter: { code: 'DEV-0001' },
    values: { name: '会议室投影仪（已改）' },
  });
  await deviceSeed.run(context);

  expect(await devices.count()).toBe(2);
  expect(await devices.findOne({ filter: { code: 'DEV-0001' } })).toMatchObject(
    { name: '会议室投影仪（已改）' },
  );
});
