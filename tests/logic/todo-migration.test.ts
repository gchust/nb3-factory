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

// The table the todo page reads and the "检查过期待办" Schedule writes through its target.
describeMigration('202610070001_create_todos', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const todos = await expectCollection('todos').toExist();
    expect(Object.keys(todos.fields)).toEqual([
      'id',
      'title',
      'dueAt',
      'completed',
      'overdue',
    ]);
    expect(todos.primaryKey).toEqual(['id']);
    await expectCollection('todos').toHaveField('title', { nullable: false });
    await expectCollection('todos').toHaveField('dueAt', { nullable: false });
    // Both flags are stored and default to false, so a todo the Schedule has not touched stays visibly open.
    await expectCollection('todos').toHaveField('completed', {
      nullable: false,
    });
    await expectCollection('todos').toHaveField('overdue', { nullable: false });
    await expectCollection('todos').toHaveIndex([
      'completed',
      'overdue',
      'dueAt',
    ]);

    await connection.query
      .insertInto('todos')
      .values({
        id: 1,
        title: 'default flags',
        dueAt: new Date('2026-01-01T00:00:00.000Z'),
      })
      .execute();
    const row = await connection.query
      .selectFrom('todos')
      .selectAll()
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    expect(row.completed).toBe(false);
    expect(row.overdue).toBe(false);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('todos').not.toExist();
  },
});
