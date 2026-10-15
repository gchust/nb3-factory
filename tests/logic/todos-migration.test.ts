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

// The table the "check overdue todos" schedule marks, and the page `/todos` lists.
describeMigration('202610100001_create_todos', {
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
    await expectCollection('todos').toHaveField('expired', {
      nullable: false,
    });
    // The schedule's filter reads these three together.
    await expectCollection('todos').toHaveIndex(
      ['completed', 'expired', 'dueAt'],
      { unique: false },
    );

    const row = {
      title: 'Submit the quarterly report',
      dueAt: '2026-09-01T00:00:00.000Z',
      completed: false,
      expired: false,
    };
    await connection.query.insertInto('todos').values(row).execute();

    // A deadline and a title are required; the two flags carry a default only when the writer supplies it.
    await expect(
      connection.query
        .insertInto('todos')
        .values({ ...row, title: null })
        .execute(),
    ).rejects.toThrow();
    await expect(
      connection.query
        .insertInto('todos')
        .values({ ...row, dueAt: null })
        .execute(),
    ).rejects.toThrow();

    const inserted = await connection.query
      .selectFrom('todos')
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(inserted.title).toBe(row.title);
    expect(inserted.completed).toBeFalsy();
    expect(inserted.expired).toBeFalsy();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('todos').not.toExist();
  },
});
