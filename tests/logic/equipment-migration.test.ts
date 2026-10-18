// @vitest-environment node
import path from 'node:path';
import { describeMigration } from '@nocobase/app-testing/server';
import type { MigrationSource } from '@nocobase/db';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'equipment-migration-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The shared equipment ledger's table and its unique code constraint.
describeMigration('202610070001_create_equipment', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const equipment = await expectCollection('equipment').toExist();
    expect(Object.keys(equipment.fields)).toEqual([
      'id',
      'code',
      'name',
      'status',
      'notes',
    ]);
    await expectCollection('equipment').toHaveField('notes', {
      nullable: true,
    });
    await expectCollection('equipment').toHaveField('code', {
      nullable: false,
    });

    const row = {
      code: 'EQ-TEST',
      name: 'Test camera',
      status: 'available',
      notes: null,
    };
    await connection.query
      .insertInto('equipment')
      .values({ ...row, id: 1 })
      .execute();
    await expect(
      connection.query
        .insertInto('equipment')
        .values({ ...row, id: 2 })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('equipment').not.toExist();
  },
});
