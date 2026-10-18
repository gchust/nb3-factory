// @vitest-environment node
import path from 'node:path';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import type { MigrationSource } from '@nocobase/db';
import { expect } from 'vitest';

import {
  createTodoService,
  type TodoRecord,
} from '../../server/providers/todos.js';

const migrations: readonly MigrationSource[] = [
  {
    packageName: 'todos-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// Fixed date so the expectation does not drift. Rows are chosen around it: one due before it, one after it.
const NOW = new Date('2026-06-01T00:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2099-12-31T00:00:00.000Z');

const test = createDatabaseTest({ migrations });

test('marks only past-due open todos as overdue', async ({ database }) => {
  const todos = database.repository<TodoRecord>('todos');
  await todos.createMany({
    values: [
      {
        title: 'overdue',
        dueAt: PAST,
        completed: false,
        overdue: false,
      },
      {
        title: 'future',
        dueAt: FUTURE,
        completed: false,
        overdue: false,
      },
      {
        title: 'completed',
        dueAt: PAST,
        completed: true,
        overdue: false,
      },
    ],
  });

  const service = createTodoService(database);
  await expect(service.checkOverdue(NOW)).resolves.toBe(1);

  const byTitle = async (title: string) => todos.findOne({ filter: { title } });
  await expect(byTitle('overdue')).resolves.toMatchObject({ overdue: true });
  // A todo that is not due yet is left alone.
  await expect(byTitle('future')).resolves.toMatchObject({ overdue: false });
  // A completed todo keeps its flag even though its due date has passed.
  await expect(byTitle('completed')).resolves.toMatchObject({ overdue: false });
});

test('running again changes nothing and creates no rows', async ({
  database,
}) => {
  const todos = database.repository<TodoRecord>('todos');
  await todos.createMany({
    values: [
      { title: 'overdue', dueAt: PAST, completed: false, overdue: false },
    ],
  });

  const service = createTodoService(database);
  await expect(service.checkOverdue(NOW)).resolves.toBe(1);
  // The second firing finds no row to change: the flag is already set, so it matches nothing.
  await expect(service.checkOverdue(NOW)).resolves.toBe(0);
  await expect(todos.count({})).resolves.toBe(1);
});

test('a todo already marked overdue is not counted again', async ({
  database,
}) => {
  const todos = database.repository<TodoRecord>('todos');
  await todos.createMany({
    values: [{ title: 'marked', dueAt: PAST, completed: false, overdue: true }],
  });

  const service = createTodoService(database);
  await expect(service.checkOverdue(NOW)).resolves.toBe(0);
});
