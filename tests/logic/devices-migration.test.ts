// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'devices-migration-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The shared device ledger: `code` and `name` are required, `code` is unique, `status` is a language-neutral code
// with a default, and `notes` is optional free text. The interface translates the status; it never translates the
// code, the name or the notes, which are stored exactly as they were typed.
describeMigration('202610070001_create_devices', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const devices = await expectCollection('devices').toExist();
    expect(Object.keys(devices.fields)).toEqual([
      'id',
      'code',
      'name',
      'status',
      'notes',
      'createdAt',
      'updatedAt',
    ]);
    expect(devices.primaryKey).toEqual(['id']);
    await expectCollection('devices').toHaveField('code', { nullable: false });
    await expectCollection('devices').toHaveField('name', { nullable: false });
    await expectCollection('devices').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('devices').toHaveField('notes', { nullable: true });
    await expectCollection('devices').toHaveField('createdAt', {
      nullable: false,
    });
    await expectCollection('devices').toHaveField('updatedAt', {
      nullable: false,
    });
    // The code identifies a device, so two devices cannot share one.
    await expectCollection('devices').toHaveIndex(['code'], {
      unique: true,
    });
    // The ledger is read by status, so the status is indexed, but several devices share a status.
    await expectCollection('devices').toHaveIndex(['status'], {
      unique: false,
    });

    const now = new Date();
    const insert = (values: Record<string, unknown>) =>
      connection.query.insertInto('devices').values(values).execute();

    // A status that was not given is the borrowable one, so a device is never left in an unknown state.
    await insert({
      code: 'DEV-100',
      name: '会议室投影仪',
      createdAt: now,
      updatedAt: now,
    });
    const defaulted = await connection.query
      .selectFrom('devices')
      .select(['status'])
      .where('code', '=', 'DEV-100')
      .executeTakeFirstOrThrow();
    expect(defaulted.status).toEqual('available');

    // A second device may hold the same status.
    await insert({
      code: 'DEV-101',
      name: 'Field Measurement Tablet',
      status: 'borrowed',
      notes: 'With the field team since Monday; due back Friday.',
      createdAt: now,
      updatedAt: now,
    });

    // The code is required and unique.
    await expect(
      insert({
        code: 'DEV-100',
        name: 'Duplicate code',
        status: 'available',
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow();
    await expect(
      insert({
        name: 'No code',
        status: 'available',
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow();
    // The name is required.
    await expect(
      insert({
        code: 'DEV-102',
        status: 'available',
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow();
    // Notes are optional: a device without them is valid.
    await insert({
      code: 'DEV-103',
      name: 'No notes',
      status: 'available',
      createdAt: now,
      updatedAt: now,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('devices').not.toExist();
  },
});
