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

// The ledger table the device API reads and writes.
describeMigration('202611010001_create_devices', {
  sources,
  up: async ({ connection, expectCollection }) => {
    await expectCollection('devices').toHaveField('id', {
      type: 'string',
      nullable: false,
    });
    await expectCollection('devices').toHaveField('code', {
      type: 'string',
      nullable: false,
    });
    await expectCollection('devices').toHaveField('name', {
      type: 'string',
      nullable: false,
    });
    await expectCollection('devices').toHaveField('status', {
      type: 'string',
      nullable: false,
    });
    await expectCollection('devices').toHaveField('notes', {
      type: 'text',
      nullable: true,
    });
    await expectCollection('devices').toHaveField('createdAt', {
      type: 'datetime',
      nullable: false,
    });
    await expectCollection('devices').toHaveField('updatedAt', {
      type: 'datetime',
      nullable: false,
    });
    // A device code identifies the device, so two rows may never share one.
    await expectCollection('devices').toHaveIndex(['code'], { unique: true });
    const devices = await expectCollection('devices').toExist();
    expect(devices.primaryKey).toEqual(['id']);

    const row = {
      code: 'DEV-1',
      name: 'One',
      status: 'available',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await connection.query
      .insertInto('devices')
      .values({ ...row, id: 'a' })
      .execute();
    await expect(
      connection.query
        .insertInto('devices')
        .values({ ...row, id: 'b' })
        .execute(),
    ).rejects.toThrow();
    await expect(
      connection.query
        .insertInto('devices')
        .values({ ...row, id: 'c', code: 'DEV-2', name: null })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('devices').not.toExist();
  },
});
