// @vitest-environment node
import path from 'node:path';
import type {
  DatabaseConnection,
  MigrationSource,
  SeedSource,
} from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { describe, expect } from 'vitest';

import seed from '../../database/main/seeds/202610060003_seed_todos.js';

const migrations: readonly MigrationSource[] = [
  {
    packageName: 'todos-seed-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const seeds: readonly SeedSource[] = [
  {
    packageName: 'todos-seed-test',
    directory: path.resolve(import.meta.dirname, '../../database/main/seeds'),
  },
];

const test = createDatabaseTest({ migrations, seeds });

interface TodoRow {
  id: number;
  title: string;
  dueAt: Date | string;
  completed: boolean;
  expired: boolean;
}

async function listTodos(connection: DatabaseConnection): Promise<TodoRow[]> {
  return connection.repository<TodoRow>('todos').findMany({
    sort: (sort) => sort.field('dueAt').asc(),
  });
}

describe('202610060003_seed_todos', () => {
  test('inserts one overdue, one future and one completed todo', async ({
    connection,
  }) => {
    const rows = await listTodos(connection);

    expect(rows.map((row) => row.title)).toEqual([
      '提交季度报销单',
      '整理上周会议纪要',
      '准备产品评审材料',
    ]);

    const [overdue, completed, future] = rows;
    expect(overdue.completed).toBe(false);
    expect(overdue.expired).toBe(false);
    expect(new Date(overdue.dueAt).getTime()).toBeLessThan(Date.now());

    expect(completed.completed).toBe(true);
    expect(completed.expired).toBe(false);
    expect(new Date(completed.dueAt).getTime()).toBeLessThan(Date.now());

    expect(future.completed).toBe(false);
    expect(future.expired).toBe(false);
    expect(new Date(future.dueAt).getTime()).toBeGreaterThan(Date.now());
  });

  test('is idempotent when its run function is executed again', async ({
    connection,
  }) => {
    await seed.run({
      config: {},
      container: {},
      repository: connection.repository.bind(connection),
      query: connection.query,
      connection,
    } as unknown as Parameters<typeof seed.run>[0]);

    const rows = await listTodos(connection);

    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.title)).size).toBe(3);
  });
});
