// @vitest-environment node
import path from 'node:path';
import { describeMigration } from '@nocobase/app-testing/server';
import type { MigrationSource } from '@nocobase/db';
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

// The device ledger table (`database/main/migrations/202610120001_create_devices.ts`).
describeMigration('202610120001_create_devices', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const devices = await expectCollection('devices').toExist();
    expect(Object.keys(devices.fields)).toEqual([
      'id',
      'reference',
      'name',
      'status',
      'remark',
      'createdAt',
      'updatedAt',
    ]);
    expect(devices.primaryKey).toEqual(['id']);
    await expectCollection('devices').toHaveField('reference', {
      nullable: false,
    });
    await expectCollection('devices').toHaveField('name', { nullable: false });
    await expectCollection('devices').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('devices').toHaveField('remark', { nullable: true });
    await expectCollection('devices').toHaveField('createdAt', {
      nullable: false,
    });
    await expectCollection('devices').toHaveField('updatedAt', {
      nullable: false,
    });

    const row = {
      reference: 'DEV-0001',
      name: 'Projector',
      status: 'available',
      remark: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await connection.query
      .insertInto('devices')
      .values({ ...row, id: 'a' })
      .execute();
    // The reference is unique.
    await expect(
      connection.query
        .insertInto('devices')
        .values({ ...row, id: 'b' })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('devices').not.toExist();
  },
});
