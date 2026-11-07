// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'todo-items-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The single table the todo page reads and the overdue schedule writes (`server/providers/todos.ts`).
describeMigration('202610130100_create_todo_items', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const todoItems = await expectCollection('todoItems').toExist();
    expect(Object.keys(todoItems.fields).sort()).toEqual([
      'completed',
      'dueAt',
      'id',
      'overdue',
      'title',
    ]);
    expect(todoItems.primaryKey).toEqual(['id']);
    for (const field of ['title', 'dueAt', 'completed', 'overdue']) {
      await expectCollection('todoItems').toHaveField(field, {
        nullable: false,
      });
    }
    // The title is the stable business identity the sample seed upserts on, so the database enforces it.
    await expectCollection('todoItems').toHaveIndex(['title'], {
      unique: true,
    });
    await expectCollection('todoItems').toHaveIndex(['dueAt']);

    const row = {
      title: 'Repeated',
      dueAt: new Date('2020-01-01T00:00:00.000Z'),
      completed: false,
      overdue: false,
    };
    await connection.query
      .insertInto('todoItems')
      .values({ ...row, id: 1 })
      .execute();
    // A second row with the same title is refused.
    await expect(
      connection.query
        .insertInto('todoItems')
        .values({ ...row, id: 2 })
        .execute(),
    ).rejects.toThrow();
    // A row without a title is refused as well.
    await expect(
      connection.query
        .insertInto('todoItems')
        .values({ id: 3, dueAt: new Date() })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('todoItems').not.toExist();
  },
});
