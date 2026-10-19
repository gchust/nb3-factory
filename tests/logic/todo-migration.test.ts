// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'todo-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202610070001_create_todo', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const todo = await expectCollection('todo').toExist();
    expect(Object.keys(todo.fields)).toEqual([
      'id',
      'title',
      'dueAt',
      'completed',
      'expired',
    ]);
    expect(todo.primaryKey).toEqual(['id']);
    await expectCollection('todo').toHaveField('title', {
      nullable: false,
      length: 191,
    });
    await expectCollection('todo').toHaveField('dueAt', {
      nullable: false,
    });
    await expectCollection('todo').toHaveField('completed', {
      nullable: false,
    });
    await expectCollection('todo').toHaveField('expired', {
      nullable: false,
    });
    await expectCollection('todo').toHaveIndex([
      'completed',
      'expired',
      'dueAt',
    ]);

    // A row written without the two flags is a pending todo, not a null flag.
    await connection.query
      .insertInto('todo')
      .values({
        id: 'a',
        title: 'Write the test',
        dueAt: new Date('2026-10-08T09:00:00.000Z'),
      })
      .execute();
    const row = await connection.query
      .selectFrom('todo')
      .selectAll()
      .where('id', '=', 'a')
      .executeTakeFirstOrThrow();
    expect(row.completed).toBe(false);
    expect(row.expired).toBe(false);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('todo').not.toExist();
  },
});
