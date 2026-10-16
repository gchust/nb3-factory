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

// The device ledger (设备台账) table: exactly code, name and status, with no approval workflow columns.
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
    // The list filters by status, so it has to be indexed.
    await expectCollection('devices').toHaveIndex(['status']);

    await connection.query
      .insertInto('devices')
      .values({ code: 'DEV-0001', name: 'Dell Latitude 5440' })
      .execute();

    // `status` falls back to `available` when a client submits no status.
    const inserted = await connection.query
      .selectFrom('devices')
      .selectAll()
      .where('code', '=', 'DEV-0001')
      .executeTakeFirstOrThrow();
    expect(inserted.status).toBe('available');

    // `code` is unique...
    await expect(
      connection.query
        .insertInto('devices')
        .values({ code: 'DEV-0001', name: 'Duplicate' })
        .execute(),
    ).rejects.toThrow();

    // ...and `name` is required.
    await expect(
      connection.query
        .insertInto('devices')
        .values({ code: 'DEV-0002' })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('devices').not.toExist();
  },
});
