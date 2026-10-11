// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'devices-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The device ledger: one device per unique code, with the name and the status required (issue #701).
describeMigration('202610070001_create_devices', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const collection = await expectCollection('devices').toExist();
    // Only the identifier and the three business fields; no timestamps or remarks.
    expect(Object.keys(collection.fields)).toEqual([
      'id',
      'code',
      'name',
      'status',
    ]);
    expect(collection.primaryKey).toEqual(['id']);
    await expectCollection('devices').toHaveField('code', {
      type: 'string',
      nullable: false,
      length: 64,
    });
    await expectCollection('devices').toHaveField('name', {
      type: 'string',
      nullable: false,
      length: 200,
    });
    await expectCollection('devices').toHaveField('status', {
      type: 'string',
      nullable: false,
      length: 32,
    });
    // The code is unique, and the unique index is what a duplicate insert runs into.
    await expectCollection('devices').toHaveIndex(['code'], {
      unique: true,
    });

    const row = { code: 'D-1', name: '测试设备', status: 'available' };
    await connection.query.insertInto('devices').values(row).execute();
    await expect(
      connection.query
        .insertInto('devices')
        .values({ ...row, name: '另一台设备' })
        .execute(),
    ).rejects.toThrow();

    // name is required, so a row without it is refused.
    await expect(
      connection.query
        .insertInto('devices')
        .values({ code: 'D-2', status: 'available' })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('devices').not.toExist();
  },
});
