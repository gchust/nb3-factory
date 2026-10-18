// @vitest-environment node
import path from 'node:path';
import { describeMigration } from '@nocobase/app-testing/server';
import type { MigrationSource } from '@nocobase/db';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'materials-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202610070001_create_materials', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const materials = await expectCollection('materials').toExist();
    expect(Object.keys(materials.fields)).toEqual([
      'id',
      'title',
      'body',
      'ownerId',
      'published',
      'confidential',
      'createdAt',
      'updatedAt',
    ]);
    expect(materials.primaryKey).toEqual(['id']);
    await expectCollection('materials').toHaveField('ownerId', {
      nullable: false,
    });
    await expectCollection('materials').toHaveField('published', {
      nullable: false,
    });
    await expectCollection('materials').toHaveField('confidential', {
      nullable: false,
    });

    const shares = await expectCollection('materialShares').toExist();
    expect(Object.keys(shares.fields)).toEqual([
      'id',
      'materialId',
      'userId',
      'createdAt',
      'updatedAt',
    ]);
    await expectCollection('materialShares').toHaveIndex(
      ['materialId', 'userId'],
      {
        unique: true,
      },
    );

    // The unique index is the mechanism that keeps a share idempotent.
    const now = new Date();
    await connection.query
      .insertInto('materialShares')
      .values({
        materialId: 1,
        userId: 'user-a',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await expect(
      connection.query
        .insertInto('materialShares')
        .values({
          materialId: 1,
          userId: 'user-a',
          createdAt: now,
          updatedAt: now,
        })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('materialShares').not.toExist();
    await expectCollection('materials').not.toExist();
  },
});
