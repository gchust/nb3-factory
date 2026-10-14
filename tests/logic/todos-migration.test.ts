// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'todos-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The table the todo API, the seed and the "check expired todos" schedule all read and write.
describeMigration('202610130001_create_todos', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const todos = await expectCollection('todos').toExist();
    expect(Object.keys(todos.fields)).toEqual([
      'id',
      'title',
      'dueAt',
      'completed',
      'expired',
      'reference',
      'createdAt',
      'updatedAt',
    ]);
    expect(todos.primaryKey).toEqual(['id']);
    await expectCollection('todos').toHaveField('title', { nullable: false });
    await expectCollection('todos').toHaveField('dueAt', { nullable: false });
    await expectCollection('todos').toHaveField('completed', {
      nullable: false,
    });
    await expectCollection('todos').toHaveField('expired', { nullable: false });
    // `reference` is internal: nullable, and unique so the seed's upsert is idempotent.
    await expectCollection('todos').toHaveField('reference', {
      nullable: true,
    });
    await expectCollection('todos').toHaveIndex(['reference'], {
      unique: true,
    });
    // The exact predicate `markExpired` scans.
    await expectCollection('todos').toHaveIndex([
      'completed',
      'expired',
      'dueAt',
    ]);

    const row = {
      title: 'A todo',
      dueAt: new Date(),
      completed: false,
      expired: false,
      reference: 'seed-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await connection.query
      .insertInto('todos')
      .values({ ...row, id: 'a' })
      .execute();
    // A second row may omit the reference.
    await connection.query
      .insertInto('todos')
      .values({ ...row, id: 'b', reference: null })
      .execute();
    // But two rows may not share one.
    await expect(
      connection.query
        .insertInto('todos')
        .values({ ...row, id: 'c' })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('todos').not.toExist();
  },
});
