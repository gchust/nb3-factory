// @vitest-environment node
import path from 'node:path';
import type { MigrationSource, SeedContext } from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import seed from '../../database/main/seeds/202610170002_seed_todos.js';

const migrations: readonly MigrationSource[] = [
  {
    packageName: 'todos-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const test = createDatabaseTest({ migrations, isolation: 'none' });

/**
 * The seed reads only `repository`, so the rest of the context (a configuration, a container, a connection) is the
 * seeder's business and not this seed's. Passing the piece it uses keeps the repeat-run test on the seed's real `run`.
 */
function seedContext(database: {
  repository(name: string): unknown;
}): SeedContext {
  return {
    repository: (name: string) => database.repository(name),
  } as unknown as SeedContext;
}

interface SeededTodo {
  readonly id: string;
  readonly title: string;
  readonly dueAt: Date | string;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: Date | string;
}

test('seeds one todo per state the sweep has to distinguish', async ({
  database,
}) => {
  await seed.run(seedContext(database));

  const todos = database.repository<SeededTodo>('todos');
  const rows = await todos.findMany();

  expect(rows.map((row) => row.title).sort()).toEqual(
    ['提交月度报表', '整理会议纪要', '预约年度体检'].sort(),
  );

  const byTitle = new Map(rows.map((row) => [row.title, row]));

  // Past due and open: the row the first scheduled run marks expired. The seed itself does not mark it, so a fresh
  // installation still has a transition to watch.
  expect(byTitle.get('提交月度报表')).toMatchObject({
    completed: false,
    expired: false,
  });
  expect(new Date(byTitle.get('提交月度报表')!.dueAt).getTime()).toBeLessThan(
    Date.now(),
  );

  // Due in the future: the sweep must leave it alone.
  expect(byTitle.get('预约年度体检')).toMatchObject({
    completed: false,
    expired: false,
  });
  expect(
    new Date(byTitle.get('预约年度体检')!.dueAt).getTime(),
  ).toBeGreaterThan(Date.now());

  // Past due but completed: the sweep must leave it alone too.
  expect(byTitle.get('整理会议纪要')).toMatchObject({
    completed: true,
    expired: false,
  });

  // Whatever the clock says when the seed runs, every row it wrote carries the same fixed creation instant.
  for (const row of rows) {
    expect(new Date(row.createdAt).toISOString()).toBe(
      '2026-01-05T09:00:00.000Z',
    );
  }
});

test('a repeat run adds nothing and keeps what a user changed', async ({
  database,
}) => {
  await seed.run(seedContext(database));

  // A user completes the overdue todo before the sweep reaches it; the seed must not put that back.
  const todos = database.repository<SeededTodo>('todos');
  await todos.updateOne({
    filter: { title: '提交月度报表' },
    values: { completed: true },
  });

  await seed.run(seedContext(database));

  const rows = await todos.findMany();
  expect(rows).toHaveLength(3);
  expect(new Set(rows.map((row) => row.id)).size).toBe(3);
  expect(rows.find((row) => row.title === '提交月度报表')).toMatchObject({
    completed: true,
  });
});
