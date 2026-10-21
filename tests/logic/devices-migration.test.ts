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

describeMigration('202610200001_create_devices', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const devices = await expectCollection('devices').toExist();
    expect(Object.keys(devices.fields)).toEqual([
      'id',
      'code',
      'name',
      'status',
    ]);
    expect(devices.primaryKey).toEqual(['id']);
    await expectCollection('devices').toHaveIndex(['code'], {
      unique: true,
    });
    await expectCollection('devices').toHaveIndex(['status']);
    await expectCollection('devices').toHaveField('name', {
      nullable: false,
    });

    const row = {
      id: 'device-a',
      code: 'DEV-A',
      name: 'Field camera',
      status: 'available',
    };
    await connection.query.insertInto('devices').values(row).execute();
    await expect(
      connection.query
        .insertInto('devices')
        .values({ ...row, id: 'device-b' })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('devices').not.toExist();
  },
});
