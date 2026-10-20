// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'device-ledger-test',
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
      'createdAt',
      'updatedAt',
    ]);
    expect(devices.primaryKey).toEqual(['id']);
    await expectCollection('devices').toHaveField('code', {
      nullable: false,
    });
    await expectCollection('devices').toHaveField('name', {
      nullable: false,
    });
    await expectCollection('devices').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('devices').toHaveIndex(['code'], {
      unique: true,
    });
    await expectCollection('devices').toHaveIndex(['status']);

    const row = {
      code: 'DEV-0001',
      name: '会议室投影仪',
      status: 'available',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await connection.query
      .insertInto('devices')
      .values({ ...row, id: 'a' })
      .execute();
    // The same business code identifies one device only.
    await expect(
      connection.query
        .insertInto('devices')
        .values({ ...row, id: 'b', code: 'DEV-0002' })
        .execute(),
    ).resolves.toBeDefined();
    await expect(
      connection.query
        .insertInto('devices')
        .values({ ...row, id: 'c' })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('devices').not.toExist();
  },
});
