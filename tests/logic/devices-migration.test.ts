// @vitest-environment node
import path from 'node:path';

import { describeMigration } from '@nocobase/app-testing/server';
import type { MigrationSource } from '@nocobase/db';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'app-devices-migration-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The device ledger's table. `describeMigration()` applies the migrations before this one, applies this one, checks
// the schema, rolls it back, checks that every table is as it was, and applies it again.
describeMigration('202610070001_create_devices', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const devices = await expectCollection('devices').toExist();
    // Only the three business fields and the id: the ledger stores no remarks and no timestamps.
    expect(Object.keys(devices.fields).sort()).toEqual([
      'code',
      'id',
      'name',
      'status',
    ]);
    expect(devices.primaryKey).toEqual(['id']);
    await expectCollection('devices').toHaveField('id', { nullable: false });
    await expectCollection('devices').toHaveField('code', { nullable: false });
    await expectCollection('devices').toHaveField('name', { nullable: false });
    await expectCollection('devices').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('devices').toHaveIndex(['code'], { unique: true });

    await connection.query
      .insertInto('devices')
      .values({ code: 'D-1', name: 'One', status: 'available' })
      .execute();
    // `code` is unique.
    await expect(
      connection.query
        .insertInto('devices')
        .values({ code: 'D-1', name: 'Two', status: 'borrowed' })
        .execute(),
    ).rejects.toThrow();
    // `name`, `status` and `code` are each required, so dropping any one of them is refused.
    await expect(
      connection.query
        .insertInto('devices')
        .values({ code: 'D-2', status: 'available' })
        .execute(),
    ).rejects.toThrow();
    await expect(
      connection.query
        .insertInto('devices')
        .values({ code: 'D-3', name: 'Three' })
        .execute(),
    ).rejects.toThrow();
    await expect(
      connection.query
        .insertInto('devices')
        .values({ name: 'Four', status: 'available' })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('devices').not.toExist();
  },
});
