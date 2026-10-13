// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'equipment-ledger-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The shared equipment ledger table (`202610200001_create_equipment`).
describeMigration('202610200001_create_equipment', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const equipment = await expectCollection('equipment').toExist();
    expect(Object.keys(equipment.fields)).toEqual([
      'id',
      'code',
      'name',
      'status',
      'notes',
      'createdAt',
      'updatedAt',
    ]);
    await expectCollection('equipment').toHaveField('code', {
      nullable: false,
    });
    await expectCollection('equipment').toHaveField('name', {
      nullable: false,
    });
    await expectCollection('equipment').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('equipment').toHaveField('notes', {
      nullable: true,
    });
    await expectCollection('equipment').toHaveField('createdAt', {
      nullable: false,
    });
    await expectCollection('equipment').toHaveField('updatedAt', {
      nullable: false,
    });

    const row = {
      code: 'EQ-TEST',
      name: 'Test device',
      status: 'available',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await connection.query
      .insertInto('equipment')
      .values({ ...row, id: 1 })
      .execute();
    // `code` is unique: a second device may not reuse it.
    await expect(
      connection.query
        .insertInto('equipment')
        .values({ ...row, id: 2, name: 'Other device' })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('equipment').not.toExist();
  },
});
