// @vitest-environment node
import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationContext,
  type SeedContext,
} from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import createTodos from '../../database/main/migrations/202509240001_create_todos.js';
import seedTodos from '../../database/main/seeds/202509240002_seed_todos.js';
import { createOverdueTodoService } from '../../server/providers/overdue-todos.js';

const NOW = new Date('2025-01-01T00:00:00.000Z');

const managers: DatabaseManager[] = [];

function createTestDatabase(): DatabaseManager {
  const database = createDatabaseManager({
    connections: { main: sqlite({ filename: ':memory:' }) },
    default: 'main',
  });
  managers.push(database);
  return database;
}

async function applyTodosMigration(database: DatabaseManager): Promise<void> {
  await createTodos.up({
    builder: database.builder('main'),
  } as unknown as MigrationContext);
}

async function runTodosSeed(database: DatabaseManager): Promise<void> {
  await seedTodos.run({
    repository: (collection: string) => database.repository(collection),
  } as unknown as SeedContext);
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((database) => database.destroy()));
});

describe('create_todos migration', () => {
  it('creates the table, its columns and its keys, and down removes it', async () => {
    const database = createTestDatabase();
    await applyTodosMigration(database);

    const schema = await database
      .connection('main')
      .schemaInspector.getPhysicalCollection({ tableName: 'todos' });

    expect(schema).toBeDefined();
    const columns = schema!.columns.map((column) => column.columnName);
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'title',
        'due_at',
        'completed',
        'overdue',
        'created_at',
      ]),
    );
    expect(schema!.primaryKey?.columns).toEqual(['id']);
    expect(
      schema!.indexes.some(
        (index) =>
          index.unique &&
          index.keys.length === 1 &&
          index.keys[0].columnName === 'title',
      ),
    ).toBe(true);
    expect(
      schema!.indexes.some(
        (index) =>
          index.unique === false &&
          index.keys.some((key) => key.columnName === 'overdue'),
      ),
    ).toBe(true);

    await createTodos.down!({
      builder: database.builder('main'),
    } as unknown as MigrationContext);

    expect(
      await database
        .connection('main')
        .schemaInspector.getPhysicalCollection({ tableName: 'todos' }),
    ).toBeUndefined();
  });
});

describe('seed_todos', () => {
  it('inserts the three baseline todos once and is idempotent on repeat', async () => {
    const database = createTestDatabase();
    await applyTodosMigration(database);

    await runTodosSeed(database);
    await runTodosSeed(database);

    const todos = await database.repository('todos').findMany();
    expect(todos).toHaveLength(3);
    expect(todos.map((todo) => todo.title).sort()).toEqual(
      [
        'Completed todo / 已完成待办',
        'Future todo / 未到期待办',
        'Overdue todo / 已过期待办',
      ].sort(),
    );
  });
});

describe('overdue check', () => {
  it('marks only open todos past their deadline and is idempotent', async () => {
    const database = createTestDatabase();
    await applyTodosMigration(database);
    await runTodosSeed(database);

    const service = createOverdueTodoService(database);

    const first = await service.checkOverdue(NOW);
    expect(first.markedCount).toBe(1);

    const byTitle = (title: string) =>
      database.repository('todos').findOne({ filter: { title } });

    const overdue = await byTitle('Overdue todo / 已过期待办');
    expect(overdue?.overdue).toBe(true);
    expect(overdue?.completed).toBe(false);

    const future = await byTitle('Future todo / 未到期待办');
    expect(future?.overdue).toBe(false);

    const completed = await byTitle('Completed todo / 已完成待办');
    expect(completed?.overdue).toBe(false);
    expect(completed?.completed).toBe(true);

    const second = await service.checkOverdue(NOW);
    expect(second.markedCount).toBe(0);

    // Re-running the seed must not undo what the scheduled task set, and must
    // not add a fourth row.
    await runTodosSeed(database);
    expect((await byTitle('Overdue todo / 已过期待办'))?.overdue).toBe(true);
    expect(await database.repository('todos').findMany()).toHaveLength(3);
  });
});
