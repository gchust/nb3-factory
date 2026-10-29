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

// The table the todo page reads and the scheduled expiry check writes.
describeMigration('202610200001_create_todos', {
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

    const row = {
      id: 'todo-a',
      title: 'Overdue',
      dueAt: new Date('2020-01-01T00:00:00.000Z'),
    };
    await connection.query.insertInto('todos').values(row).execute();
    const inserted = await connection.query
      .selectFrom('todos')
      .selectAll()
      .where('id', '=', 'todo-a')
      .executeTakeFirstOrThrow();
    // The booleans are required and default to false, so the scheduler's
    // not-yet-expired filter matches every new row.
    expect(inserted.completed).toBeFalsy();
    expect(inserted.expired).toBeFalsy();
    await expect(
      connection.query
        .insertInto('todos')
        .values({ ...row, title: 'Duplicate id' })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('todos').not.toExist();
  },
});
