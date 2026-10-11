// @vitest-environment node
import path from 'node:path';
import type { MigrationSource, SeedSource } from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createTodosService } from '../../server/providers/todos.js';

const sources: readonly MigrationSource[] = [
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

// A real database, so the service's filter, its update and the seed's idempotency are exercised together rather than
// against a mock that returns whatever the test wants.
const test = createDatabaseTest({ migrations: sources, seeds });

test('seeds one overdue, one future and one completed todo', async ({
  database,
}) => {
  const rows = await createTodosService(database).list();

  expect(rows).toHaveLength(3);
  // The seed itself sets no flag: `expired` is the schedule's to set.
  expect(rows.filter((row) => row.completed)).toHaveLength(1);
  expect(rows.filter((row) => row.expired)).toHaveLength(0);
});

test('marks only overdue, unfinished todos as expired, exactly once', async ({
  database,
}) => {
  const todos = createTodosService(database);

  expect(await todos.markOverdue(new Date())).toBe(1);
  // Idempotent: the second run changes nothing, so a repeated schedule never duplicates work.
  expect(await todos.markOverdue(new Date())).toBe(0);

  const rows = await todos.list();
  const overdue = rows.filter((row) => row.expired);
  expect(overdue).toHaveLength(1);
  expect(overdue[0]).toMatchObject({ completed: false });
  // The other two rows are untouched: one is not completed and not expired, the other is completed.
  expect(rows.filter((row) => !row.expired)).toHaveLength(2);
  expect(rows.filter((row) => row.completed && !row.expired)).toHaveLength(1);
});

test('a deadline later than the check time is not marked', async ({
  database,
}) => {
  const todos = createTodosService(database);

  // Ninety minutes ago is before the seeded overdue deadline, so no row is overdue yet in that instant.
  expect(await todos.markOverdue(new Date(Date.now() - 90 * 60 * 1000))).toBe(
    0,
  );
});

test('completing an expired todo leaves the schedule flag alone', async ({
  database,
}) => {
  const todos = createTodosService(database);
  await todos.markOverdue(new Date());
  const overdue = (await todos.list()).find((row) => row.expired);
  expect(overdue).toBeDefined();

  const updated = await todos.setCompleted(overdue!.id, true);
  expect(updated).toMatchObject({
    id: overdue!.id,
    completed: true,
    expired: true,
  });
  expect(await todos.markOverdue(new Date())).toBe(0);
});

test('setting a missing todo reports no record', async ({ database }) => {
  expect(await createTodosService(database).setCompleted(9999, true)).toBe(
    undefined,
  );
});
