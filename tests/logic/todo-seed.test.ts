// @vitest-environment node
import path from 'node:path';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import type { MigrationSource, SeedSource } from '@nocobase/db';
import { expect } from 'vitest';

import type { TodoRecord } from '../../server/providers/todos.js';

const migrations: readonly MigrationSource[] = [
  {
    packageName: 'todos-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];
const seeds: readonly SeedSource[] = [
  {
    packageName: 'todos-test',
    directory: path.resolve(import.meta.dirname, '../../database/main/seeds'),
  },
];

// The test's setup installs the application's own seeds on a fresh schema, the same rows `pnpm nocobase db apply`
// loads. The walkthrough needs all three states present before the Schedule's first firing.
const test = createDatabaseTest({ migrations, seeds });

test('installs one overdue, one future and one completed todo', async ({
  database,
}) => {
  const rows = await database
    .repository<TodoRecord>('todos')
    .findMany({ sort: (sort) => sort.field('dueAt').asc() });

  expect(rows.map((row) => [row.title, row.completed, row.overdue])).toEqual([
    ['过期待办（示例）', false, false],
    ['已完成的过期待办（示例）', true, false],
    ['未来待办（示例）', false, false],
  ]);
});

test('a second run executes nothing and duplicates no row', async ({
  database,
}) => {
  const result = await database.createSeeder({ sources: seeds }).run();

  expect(result.executed).toEqual([]);
  expect(result.skippedSamples).toEqual([]);
  await expect(
    database.repository<TodoRecord>('todos').count({}),
  ).resolves.toBe(3);
});

test('does not overwrite a seeded title the user has since edited', async ({
  database,
}) => {
  const todos = database.repository<TodoRecord>('todos');
  await todos.updateMany({
    filter: (filter) => filter.string('title').eq('过期待办（示例）'),
    values: { completed: true },
  });

  await database.createSeeder({ sources: seeds }).run();

  const row = await todos.findOne({ filter: { title: '过期待办（示例）' } });
  expect(row?.completed).toBe(true);
  await expect(todos.count({})).resolves.toBe(3);
});
