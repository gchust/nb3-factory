// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'library-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The three tables behind the internal document library. Their shape is asserted field by field, because a later
// library change must never change what this already-applied migration means.
describeMigration('202610200001_create_material_library', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const materials = await expectCollection('materials').toExist();
    expect(Object.keys(materials.fields)).toEqual([
      'id',
      'reference',
      'title',
      'body',
      'ownerId',
      'published',
      'confidential',
      'createdAt',
      'updatedAt',
    ]);
    expect(materials.primaryKey).toEqual(['id']);
    await expectCollection('materials').toHaveField('title', {
      nullable: false,
    });
    await expectCollection('materials').toHaveField('body', { nullable: true });
    await expectCollection('materials').toHaveField('published', {
      nullable: false,
    });
    await expectCollection('materials').toHaveIndex(['reference'], {
      unique: true,
    });

    const shares = await expectCollection('materialShares').toExist();
    expect(Object.keys(shares.fields)).toEqual([
      'id',
      'materialId',
      'userId',
      'grantedById',
      'createdAt',
    ]);
    await expectCollection('materialShares').toHaveIndex(
      ['materialId', 'userId'],
      { unique: true },
    );

    const roles = await expectCollection('libraryMemberRoles').toExist();
    expect(Object.keys(roles.fields)).toEqual([
      'id',
      'userId',
      'role',
      'createdAt',
      'updatedAt',
    ]);
    await expectCollection('libraryMemberRoles').toHaveIndex(['userId'], {
      unique: true,
    });

    // A material reference is unique, and a person is shared a material at most once.
    const now = new Date();
    const material = {
      id: 'material-1',
      reference: 'material-p',
      title: 'Public',
      body: 'Body',
      ownerId: 'user-1',
      published: true,
      confidential: false,
      createdAt: now,
      updatedAt: now,
    };
    await connection.query.insertInto('materials').values(material).execute();
    await expect(
      connection.query
        .insertInto('materials')
        .values({ ...material, id: 'material-2' })
        .execute(),
    ).rejects.toThrow();

    await connection.query
      .insertInto('materialShares')
      .values({
        materialId: 'material-1',
        userId: 'user-2',
        grantedById: 'user-1',
        createdAt: now,
      })
      .execute();
    await expect(
      connection.query
        .insertInto('materialShares')
        .values({
          materialId: 'material-1',
          userId: 'user-2',
          grantedById: 'user-1',
          createdAt: now,
        })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('materialShares').not.toExist();
    await expectCollection('libraryMemberRoles').not.toExist();
    await expectCollection('materials').not.toExist();
  },
});
