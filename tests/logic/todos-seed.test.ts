// @vitest-environment node
import path from 'node:path';
import {
  createSeeder,
  type MigrationSource,
  type SeedSource,
} from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { describe, expect } from 'vitest';

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

const test = createDatabaseTest({ migrations });

const SEED_NAME = '202610100002_seed_todos';

describe('202610100002_seed_todos', () => {
  test('runs without sample data being enabled, because the rows are required', async ({
    database,
  }) => {
    const seeder = createSeeder({ database, sources: seeds });

    const result = await seeder.run();

    expect(result.executed).toEqual([SEED_NAME]);
    expect(result.skippedSamples).toEqual([]);
    expect(await database.repository<{ id: number }>('todos').count()).toBe(3);
  });

  test('seeds one overdue, one future and one completed todo, and no duplicates on a second run', async ({
    database,
  }) => {
    const seeder = createSeeder({ database, sources: seeds });

    const first = await seeder.run();
    expect(first.executed).toEqual([SEED_NAME]);

    const todos = database.repository<{
      id: number;
      title: string;
      dueAt: string;
      completed: boolean;
      expired: boolean;
    }>('todos');
    expect(await todos.count()).toBe(3);

    const records = await todos.findMany({
      sort: (sort) => sort.field('dueAt').asc(),
    });
    const now = Date.now();
    const overdue = records.filter(
      (record) => Date.parse(record.dueAt) < now && !record.completed,
    );
    const future = records.filter(
      (record) => Date.parse(record.dueAt) > now && !record.completed,
    );
    const completed = records.filter((record) => record.completed);
    expect(overdue).toHaveLength(1);
    expect(future).toHaveLength(1);
    expect(completed).toHaveLength(1);
    // The seed writes the flag itself; only the schedule marks a todo expired.
    expect(records.every((record) => record.expired === false)).toBe(true);

    const second = await seeder.run();
    expect(second.executed).toEqual([]);
    expect(second.skipped).toEqual([SEED_NAME]);
    expect(await todos.count()).toBe(3);
  });

  test('re-running from a fresh seed history still writes no duplicate todo', async ({
    database,
  }) => {
    const todos = database.repository<{ id: number }>('todos');
    const options = { database, sources: seeds };

    await createSeeder({ ...options, tableName: 'todos_seed_history_a' }).run();
    expect(await todos.count()).toBe(3);

    // A history with no record of the seed, as a database installed before it has.
    await createSeeder({ ...options, tableName: 'todos_seed_history_b' }).run();
    expect(await todos.count()).toBe(3);
  });
});
