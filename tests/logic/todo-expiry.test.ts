// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { TodoService, type TodoRecord } from '../../server/providers/todos.js';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'todo-expiry-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const test = createDatabaseTest({ migrations: sources });

const DAY_MS = 24 * 60 * 60 * 1000;

test('list returns every todo earliest due time first', async ({
  database,
}) => {
  const repository = database.repository<TodoRecord>('todos');
  await repository.createMany({
    values: [
      {
        title: 'later',
        dueAt: new Date(Date.now() + DAY_MS),
        completed: false,
        expired: false,
      },
      {
        title: 'earlier',
        dueAt: new Date(Date.now() - DAY_MS),
        completed: false,
        expired: false,
      },
    ],
  });

  const rows = await new TodoService(database).list();

  expect(rows.map((row) => row.title)).toEqual(['earlier', 'later']);
  // The repository reads the boolean columns back as booleans, not 0 and 1.
  expect(rows[0].completed).toBe(false);
  expect(rows[0].expired).toBe(false);
});

test('expireOverdue marks only overdue unfinished todos, and is idempotent', async ({
  database,
}) => {
  const now = new Date('2030-01-01T00:00:00.000Z');
  const repository = database.repository<TodoRecord>('todos');
  await repository.createMany({
    values: [
      {
        title: 'overdue',
        dueAt: new Date(now.getTime() - DAY_MS),
        completed: false,
        expired: false,
      },
      {
        title: 'future',
        dueAt: new Date(now.getTime() + DAY_MS),
        completed: false,
        expired: false,
      },
      {
        title: 'finished',
        dueAt: new Date(now.getTime() - DAY_MS),
        completed: true,
        expired: false,
      },
      {
        title: 'already expired',
        dueAt: new Date(now.getTime() - DAY_MS),
        completed: false,
        expired: true,
      },
    ],
  });
  const service = new TodoService(database);

  const first = await service.expireOverdue(now);
  expect(first.updatedCount).toBe(1);

  const byTitle = new Map(
    (await service.list()).map((row) => [row.title, row]),
  );
  expect(byTitle.get('overdue')?.expired).toBe(true);
  expect(byTitle.get('future')?.expired).toBe(false);
  expect(byTitle.get('finished')?.expired).toBe(false);
  // A row already marked is not touched, so a repeated sweep changes nothing.
  expect(byTitle.get('already expired')?.expired).toBe(true);

  const second = await service.expireOverdue(now);
  expect(second.updatedCount).toBe(0);
  // The rule only flips a flag: no record is added and none is removed.
  expect(await repository.count()).toBe(4);
});

test('a todo due exactly now is not expired yet', async ({ database }) => {
  const now = new Date('2030-01-01T00:00:00.000Z');
  const repository = database.repository<TodoRecord>('todos');
  await repository.createOne({
    values: {
      title: 'due now',
      dueAt: now,
      completed: false,
      expired: false,
    },
  });

  const { updatedCount } = await new TodoService(database).expireOverdue(now);

  expect(updatedCount).toBe(0);
  expect(
    (await repository.findOne({ filter: { title: 'due now' } }))?.expired,
  ).toBe(false);
});
