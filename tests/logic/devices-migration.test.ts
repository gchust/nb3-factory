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

describeMigration('202610060002_create_devices', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const devices = await expectCollection('devices').toExist();
    expect(Object.keys(devices.fields)).toEqual([
      'id',
      'code',
      'name',
      'status',
      'notes',
    ]);
    expect(devices.primaryKey).toEqual(['id']);
    await expectCollection('devices').toHaveField('code', {
      nullable: false,
      length: 64,
    });
    await expectCollection('devices').toHaveField('name', {
      nullable: false,
      length: 100,
    });
    await expectCollection('devices').toHaveField('notes', {
      nullable: true,
    });
    await expectCollection('devices').toHaveIndex(['code'], {
      unique: true,
    });
    await expectCollection('devices').toHaveIndex(['status']);

    // Status has a database default, so a device inserted without one is available.
    await connection.query
      .insertInto('devices')
      .values({ id: 'a', code: 'DEV-A', name: 'Device A' })
      .execute();
    const inserted = await connection.query
      .selectFrom('devices')
      .selectAll()
      .where('id', '=', 'a')
      .executeTakeFirstOrThrow();
    expect(inserted.status).toBe('available');
    expect(inserted.notes).toBeNull();

    await expect(
      connection.query
        .insertInto('devices')
        .values({ id: 'b', code: 'DEV-A', name: 'Device B' })
        .execute(),
    ).rejects.toThrow();
    await expect(
      connection.query
        .insertInto('devices')
        .values({ id: 'c', code: 'DEV-C', name: null })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('devices').not.toExist();
  },
});
