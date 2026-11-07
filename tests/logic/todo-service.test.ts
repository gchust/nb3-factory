// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createTodoService } from '../../server/providers/todo.js';

const migrations: readonly MigrationSource[] = [
  {
    packageName: 'todo-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const test = createDatabaseTest({ migrations });
const now = new Date('2026-10-08T12:00:00.000Z');

test('creates, lists, updates and deletes todos', async ({ database }) => {
  const todos = createTodoService(database);
  const later = await todos.create({
    title: 'Later',
    dueAt: '2026-10-09T09:00:00.000Z',
  });
  const earlier = await todos.create({
    title: 'Earlier',
    dueAt: '2026-10-08T13:00:00.000Z',
  });

  expect(later).toMatchObject({
    title: 'Later',
    completed: false,
    expired: false,
  });
  expect(await todos.list({ page: 1, pageSize: 20 })).toMatchObject({
    total: 2,
    items: [
      { id: earlier.id, title: 'Earlier' },
      { id: later.id, title: 'Later' },
    ],
  });

  const updated = await todos.update(later.id, {
    title: 'Renamed',
    completed: true,
  });
  expect(updated).toMatchObject({
    id: later.id,
    title: 'Renamed',
    completed: true,
  });

  await todos.remove(earlier.id);
  expect(await todos.list({ page: 1, pageSize: 20 })).toMatchObject({
    total: 1,
    items: [{ id: later.id }],
  });
  await expect(
    todos.update(earlier.id, { completed: false }),
  ).rejects.toThrow();
});

test('marks only unfinished past-due todos expired, once', async ({
  database,
}) => {
  const todos = createTodoService(database);
  const overdue = await todos.create({
    title: 'Overdue',
    dueAt: '2026-10-08T11:00:00.000Z',
  });
  const completed = await todos.create({
    title: 'Already done',
    dueAt: '2026-10-08T10:00:00.000Z',
  });
  const future = await todos.create({
    title: 'Future',
    dueAt: '2026-10-08T13:00:00.000Z',
  });
  await todos.update(completed.id, { completed: true });

  expect(await todos.markExpired(now)).toBe(1);
  const list = await todos.list({ page: 1, pageSize: 20 });
  expect(list.items.map(({ title, expired }) => ({ title, expired }))).toEqual([
    { title: 'Already done', expired: false },
    { title: 'Overdue', expired: true },
    { title: 'Future', expired: false },
  ]);
  // The filter excludes rows it already changed, so a repeated run changes nothing.
  expect(await todos.markExpired(now)).toBe(0);

  // A new due time clears the old overdue decision and leaves the row pending again.
  await todos.update(overdue.id, { dueAt: '2026-10-10T09:00:00.000Z' });
  expect(
    (await todos.list({ page: 1, pageSize: 20 })).items.find(
      (todo) => todo.id === overdue.id,
    ),
  ).toMatchObject({ expired: false, dueAt: '2026-10-10T09:00:00.000Z' });
  expect(future.expired).toBe(false);
});
