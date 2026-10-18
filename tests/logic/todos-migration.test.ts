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

// The table the todo page reads and the scheduled sweep writes (`database/main/migrations/202610170001_create_todos.ts`).
describeMigration('202610170001_create_todos', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const todos = await expectCollection('todos').toExist();
    expect(Object.keys(todos.fields)).toEqual([
      'id',
      'title',
      'dueAt',
      'completed',
      'expired',
      'createdAt',
    ]);
    expect(todos.primaryKey).toEqual(['id']);

    // Every column the page and the sweep rely on is required: a todo without a due time could never expire, and a
    // missing flag would make the sweep's filter compare against NULL instead of false.
    await expectCollection('todos').toHaveField('title', {
      nullable: false,
      length: 200,
    });
    await expectCollection('todos').toHaveField('dueAt', { nullable: false });
    await expectCollection('todos').toHaveField('completed', {
      nullable: false,
    });
    await expectCollection('todos').toHaveField('expired', { nullable: false });
    await expectCollection('todos').toHaveField('createdAt', {
      nullable: false,
    });

    // The index mirrors the sweep's filter: open, not yet marked, past due.
    await expectCollection('todos').toHaveIndex(
      ['completed', 'expired', 'dueAt'],
      { unique: false },
    );

    const row = {
      title: '提交月度报表',
      dueAt: new Date('2020-01-02T02:00:00.000Z'),
      completed: false,
      expired: false,
      createdAt: new Date('2026-01-05T09:00:00.000Z'),
    };
    await connection.query
      .insertInto('todos')
      .values({ ...row, id: '11111111-1111-4111-8111-111111111111' })
      .execute();

    // `id` is the primary key, so a second row cannot claim it.
    await expect(
      connection.query
        .insertInto('todos')
        .values({ ...row, id: '11111111-1111-4111-8111-111111111111' })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('todos').not.toExist();
  },
});
