// @vitest-environment node
import path from 'node:path';
import {
  createDatabaseTest,
  describeMigration,
} from '@nocobase/app-testing/server';
import type { MigrationSource, SeedContext, SeedSource } from '@nocobase/db';
import { expect } from 'vitest';

import seed from '../../database/main/seeds/202610070002_seed_todos.js';
import { createTodoService } from '../../server/providers/todos.js';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'todos-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const seedSources: readonly SeedSource[] = [
  {
    packageName: 'todos-test',
    directory: path.resolve(import.meta.dirname, '../../database/main/seeds'),
  },
];

describeMigration('202610070001_create_todos', {
  sources,
  up: async ({ expectCollection }) => {
    const todos = await expectCollection('todos').toExist();

    expect(todos.primaryKey).toEqual(['id']);
    await expectCollection('todos').toHaveField('id', {
      type: 'string',
      nullable: false,
    });
    await expectCollection('todos').toHaveField('title', {
      type: 'string',
      nullable: false,
    });
    await expectCollection('todos').toHaveField('dueAt', {
      type: 'datetime',
      nullable: false,
    });
    await expectCollection('todos').toHaveField('completed', {
      type: 'boolean',
      nullable: false,
    });
    await expectCollection('todos').toHaveField('expired', {
      type: 'boolean',
      nullable: false,
    });
    await expectCollection('todos').toHaveIndex([
      'completed',
      'expired',
      'dueAt',
    ]);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('todos').not.toExist();
  },
});

const test = createDatabaseTest({
  migrations: sources,
  seeds: seedSources,
  isolation: 'none',
});

test('installs the sample todos idempotently', async ({ connection }) => {
  const repository = connection.repository('todos');
  const rows = await repository.findMany({
    sort: (sort) => sort.field('id').asc(),
  });

  expect(rows.map((row) => row.id)).toEqual([
    'todo-future',
    'todo-overdue-completed',
    'todo-overdue-incomplete',
  ]);

  const run = () =>
    seed.run({
      repository: (collection: string) => connection.repository(collection),
    } as SeedContext);

  await run();
  await run();

  await expect(repository.count()).resolves.toBe(3);
});

test('marks only past-due, incomplete todos and makes a repeat run a no-op', async ({
  connection,
}) => {
  const todos = createTodoService(connection);

  await expect(
    todos.markOverdue(new Date('2025-01-01T00:00:00.000Z')),
  ).resolves.toEqual({
    marked: 1,
    checkedAt: '2025-01-01T00:00:00.000Z',
  });

  const rows = await connection.repository('todos').findMany({
    sort: (sort) => sort.field('id').asc(),
  });
  expect(
    rows.map(({ id, completed, expired }) => ({ id, completed, expired })),
  ).toEqual([
    { id: 'todo-future', completed: false, expired: false },
    { id: 'todo-overdue-completed', completed: true, expired: false },
    { id: 'todo-overdue-incomplete', completed: false, expired: true },
  ]);

  await expect(
    todos.markOverdue(new Date('2025-01-01T00:00:00.000Z')),
  ).resolves.toMatchObject({ marked: 0 });
  await expect(todos.list()).resolves.toEqual([
    {
      id: 'todo-overdue-incomplete',
      title: 'Prepare the production schedule',
      dueAt: '2020-01-01T08:00:00.000Z',
      completed: false,
      expired: true,
    },
    {
      id: 'todo-overdue-completed',
      title: 'Confirm the raw material stock',
      dueAt: '2020-02-01T08:00:00.000Z',
      completed: true,
      expired: false,
    },
    {
      id: 'todo-future',
      title: 'Inspect the new assembly line',
      dueAt: '2099-01-01T08:00:00.000Z',
      completed: false,
      expired: false,
    },
  ]);
});
