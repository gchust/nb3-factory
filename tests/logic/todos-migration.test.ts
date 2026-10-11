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

// The one table this scaffolding task needs: a title, a deadline, and the two flags the schedule and the page share.
describeMigration('202610070001_create_todos', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const todos = await expectCollection('todos').toExist();
    expect(Object.keys(todos.fields)).toEqual([
      'id',
      'title',
      'dueAt',
      'completed',
      'expired',
    ]);
    expect(todos.primaryKey).toEqual(['id']);
    await expectCollection('todos').toHaveField('title', { nullable: false });
    await expectCollection('todos').toHaveField('dueAt', { nullable: false });
    await expectCollection('todos').toHaveField('completed', {
      nullable: false,
    });
    await expectCollection('todos').toHaveField('expired', { nullable: false });

    const row = {
      title: 'Migration probe',
      dueAt: new Date(),
      completed: false,
      expired: false,
    };
    await connection.query
      .insertInto('todos')
      .values({ ...row, id: 1 })
      .execute();
    // A todo must carry a title and a deadline.
    await expect(
      connection.query
        .insertInto('todos')
        .values({ ...row, id: 2, title: null })
        .execute(),
    ).rejects.toThrow();
    await expect(
      connection.query
        .insertInto('todos')
        .values({ ...row, id: 3, dueAt: null })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('todos').not.toExist();
  },
});
