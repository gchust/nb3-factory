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

// The device ledger: code, name and status, with a unique code.
describeMigration('202610070001_create_devices', {
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
    await expectCollection('devices').toHaveField('code', { nullable: false });
    await expectCollection('devices').toHaveField('name', { nullable: false });
    await expectCollection('devices').toHaveField('status', {
      nullable: false,
    });
    // The status filter reads this index.
    await expectCollection('devices').toHaveIndex(['status']);
    await expectCollection('devices').toHaveIndex(['code'], {
      unique: true,
    });

    await connection.query
      .insertInto('devices')
      .values({ id: 1, code: 'DEV-001', name: 'A', status: 'available' })
      .execute();
    // The code is unique, the status is not.
    await expect(
      connection.query
        .insertInto('devices')
        .values({ id: 2, code: 'DEV-001', name: 'B', status: 'borrowed' })
        .execute(),
    ).rejects.toThrow();
    await connection.query
      .insertInto('devices')
      .values({ id: 3, code: 'DEV-002', name: 'C', status: 'available' })
      .execute();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('devices').not.toExist();
  },
});
