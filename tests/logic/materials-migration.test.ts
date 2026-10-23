// @vitest-environment node
import path from 'node:path';
import { describeMigration } from '@nocobase/app-testing/server';
import type { MigrationSource } from '@nocobase/db';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'materials-migration-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The internal materials library (Issue #797): one row per material a contributor owns.
describeMigration('202610200001_create_materials', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const materials = await expectCollection('materials').toExist();
    expect(materials.fields).toMatchObject({
      title: { nullable: false },
      body: { nullable: true },
      ownerId: { nullable: false },
      ownerName: { nullable: true },
      published: { nullable: false },
      confidential: { nullable: false },
      createdAt: { nullable: false },
      updatedAt: { nullable: false },
    });
    expect(materials.primaryKey).toEqual(['id']);

    const row = {
      title: 'Migration probe',
      body: null,
      ownerId: 'materials-user-probe',
      ownerName: 'Probe',
      published: false,
      confidential: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await connection.query
      .insertInto('materials')
      .values({ ...row, id: 'materials-probe-a' })
      .execute();
    // A material always has an owner and a title.
    await expect(
      connection.query
        .insertInto('materials')
        .values({ ...row, id: 'materials-probe-b', title: null as never })
        .execute(),
    ).rejects.toThrow();
    await expect(
      connection.query
        .insertInto('materials')
        .values({ ...row, id: 'materials-probe-c', ownerId: null as never })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('materials').not.toExist();
  },
});
