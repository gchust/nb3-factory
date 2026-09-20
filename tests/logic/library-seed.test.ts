import type { DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import pageAccessSeed from '../../database/main/seeds/202609200010_grant_library_page_access.js';
import demoSeed from '../../database/main/seeds/202609200011_seed_library_demo.js';
import { createLibraryDatabase } from '../fixtures/library.js';

describe('library seeds', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = await createLibraryDatabase();
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function count(table: string): Promise<number> {
    const row = await database
      .query()
      .selectFrom(table)
      .select((eb) => [eb.fn.count('id').as('total')])
      .executeTakeFirst();
    return Number(row?.total ?? 0);
  }

  async function createUserTables(): Promise<void> {
    const connection = database.connection();
    await connection.builder.createCollection('user', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('name', { length: 255 }).nullable();
      collection.string('username', { length: 255 }).nullable();
      collection.string('email', { length: 255 }).notNull();
      collection.boolean('emailVerified').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
    await connection.builder.createCollection('account', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('issuer', { length: 255 }).notNull();
      collection.string('accountId', { length: 255 }).notNull();
      collection.string('providerId', { length: 255 }).notNull();
      collection.string('userId', { length: 255 }).notNull();
      collection.text('password').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
    const now = new Date();
    await database
      .query()
      .insertInto('user')
      .values({
        id: 'admin-id',
        name: 'nocobase',
        username: 'nocobase',
        email: 'admin@nocobase.com',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  it('seeds six materials, two members and four borrowings, and is safe to re-run', async () => {
    await createUserTables();
    await demoSeed.run({
      query: database.connection().query,
      connection: database.connection(),
    });

    expect(await count('materials')).toBe(6);
    expect(await count('material_files')).toBe(15);
    expect(await count('material_readers')).toBe(2);
    expect(await count('material_borrowings')).toBe(4);
    expect(await count('user')).toBe(3);
    expect(await count('account')).toBe(2);

    const product = await database
      .query()
      .selectFrom('materials')
      .select(['availableCopies', 'totalCopies'])
      .where('title', '=', '产品设计规范')
      .executeTakeFirst();
    // One copy of this material is already out on loan.
    expect(Number(product?.availableCopies)).toBe(1);
    expect(Number(product?.totalCopies)).toBe(2);

    const statuses = await database
      .query()
      .selectFrom('materialBorrowings')
      .select('status')
      .execute();
    expect(new Set(statuses.map((row) => String(row.status)))).toEqual(
      new Set(['pending', 'borrowed', 'returned', 'cancelled']),
    );

    // Seed borrowings carry a human label so the admin queue never shows a raw user id.
    const borrowers = await database
      .query()
      .selectFrom('materialBorrowings')
      .select('borrowerName')
      .execute();
    for (const row of borrowers) {
      expect(['李梅', '王强']).toContain(String(row.borrowerName));
    }

    await demoSeed.run({
      query: database.connection().query,
      connection: database.connection(),
    });
    expect(await count('materials')).toBe(6);
    expect(await count('material_files')).toBe(15);
    expect(await count('material_borrowings')).toBe(4);
    expect(await count('user')).toBe(3);
  });

  it('grants library page access to signed-in users once', async () => {
    const connection = database.connection();
    await connection.builder.createCollection(
      'authorizationPermissionSets',
      (collection) => {
        collection.string('id', { length: 64 }).notNull().primary();
        collection.string('key', { length: 255 }).notNull().unique();
        collection.string('title', { length: 255 }).nullable();
        collection.json('grants').notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
      },
    );
    await connection.builder.createCollection(
      'authorizationPermissionSetAssignments',
      (collection) => {
        collection.string('id', { length: 255 }).notNull().primary();
        collection.string('subjectType', { length: 64 }).notNull();
        collection.string('subjectId', { length: 255 }).notNull();
        collection.string('permissionSetKey', { length: 255 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
      },
    );

    for (let run = 0; run < 2; run += 1) {
      await pageAccessSeed.run({
        query: connection.query,
        connection,
      });
    }

    expect(await count('authorizationPermissionSets')).toBe(1);
    expect(await count('authorizationPermissionSetAssignments')).toBe(1);

    const set = await database
      .query()
      .selectFrom('authorizationPermissionSets')
      .select('grants')
      .where('key', '=', 'library-access')
      .executeTakeFirst();
    const grants = JSON.parse(String(set?.grants)) as {
      resource: { type: string; id: string };
      actions: { action: string }[];
    }[];
    const pageIds = grants.map((grant) => grant.resource.id).sort();
    expect(pageIds).toEqual([
      'borrowings-admin',
      'library',
      'library-detail',
      'my-borrowings',
    ]);
  });
});
