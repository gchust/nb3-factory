// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { SeedContext } from '@nocobase/db';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { sqlite, sqliteDriver } from '@nocobase/db-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609240001_create_todos.js';
import seed from '../../database/main/seeds/202609240002_seed_todos.js';
import {
  DatabaseTodoService,
  createExpireTarget,
  type TodoRecord,
} from '../../server/providers/todos.js';

type MigrationUp = (context: {
  builder: ReturnType<DatabaseManager['builder']>;
}) => Promise<void>;

const OVERDUE_TITLE = '过期待办 / Overdue todo';
const FUTURE_TITLE = '未来待办 / Future todo';
const COMPLETED_TITLE = '已完成待办 / Completed todo';

let directory: string;
let manager: DatabaseManager;

function applyMigrationUp(): Promise<void> {
  const up = migration.up.bind(migration) as unknown as MigrationUp;
  return up({ builder: manager.builder('main') });
}

function applyMigrationDown(): Promise<void> {
  return migration.down({
    builder: manager.builder('main'),
  }) as unknown as Promise<void>;
}

function runSeed(): Promise<void> {
  const context = {
    repository: (collection: string) => manager.repository(collection),
  } as unknown as SeedContext;
  return seed.run(context);
}

function todos(): DatabaseTodoService {
  return new DatabaseTodoService(manager.repository<TodoRecord>('todos'));
}

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'nb3-todos-'));
  manager = createDatabaseManager({
    default: 'main',
    drivers: { sqlite: sqliteDriver },
    connections: {
      main: {
        ...sqlite({ filename: path.join(directory, 'test.sqlite') }),
        schemaManagement: 'managed',
      },
    },
  });
  await manager.connect('main');
  await applyMigrationUp();
});

afterEach(async () => {
  await manager.destroy();
  rmSync(directory, { recursive: true, force: true });
});

describe('todos migration', () => {
  it('creates the collection on up and removes it on down', async () => {
    expect(await manager.builder('main').hasCollection('todos')).toBe(true);

    await applyMigrationDown();

    expect(await manager.builder('main').hasCollection('todos')).toBe(false);
  });
});

describe('todos seed', () => {
  it('inserts exactly one overdue, one future and one completed todo', async () => {
    await runSeed();

    const rows = await todos().list();
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.title))).toEqual(
      new Set([OVERDUE_TITLE, FUTURE_TITLE, COMPLETED_TITLE]),
    );

    const byTitle = new Map(rows.map((row) => [row.title, row]));
    expect(byTitle.get(OVERDUE_TITLE)?.completed).toBe(false);
    expect(byTitle.get(FUTURE_TITLE)?.completed).toBe(false);
    expect(byTitle.get(COMPLETED_TITLE)?.completed).toBe(true);
    expect(rows.every((row) => row.expired === false)).toBe(true);
  });

  it('is idempotent and does not overwrite user edits on a repeated run', async () => {
    await runSeed();

    // Simulate a user completing the overdue todo between seed runs.
    const overdue = (await todos().list()).find(
      (row) => row.title === OVERDUE_TITLE,
    );
    expect(overdue).toBeDefined();
    await todos().setCompleted(overdue!.id, true);

    await runSeed();

    const rows = await todos().list();
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.title === OVERDUE_TITLE)?.completed).toBe(
      true,
    );
  });
});

describe('todo expiration target', () => {
  it('reports itself ready', async () => {
    const target = createExpireTarget(todos());
    await expect(target.describe?.({})).resolves.toMatchObject({
      targetLabel: '检查过期待办',
      state: 'ready',
    });
    expect(target.validate({})).toEqual({ valid: true });
  });

  it('expires only incomplete todos whose deadline has passed', async () => {
    await runSeed();
    const target = createExpireTarget(todos());

    const result = await target.start(
      {},
      { scheduleId: 'schedule-1', occurrenceId: 'occurrence-1' },
    );

    expect(result.state).toBe('completed');
    expect(result.state === 'completed' && result.outcome).toBe('succeeded');
    expect(result.state === 'completed' && result.result?.expired).toBe(1);

    const rows = await todos().list();
    const byTitle = new Map(rows.map((row) => [row.title, row]));
    expect(byTitle.get(OVERDUE_TITLE)?.expired).toBe(true);
    expect(byTitle.get(FUTURE_TITLE)?.expired).toBe(false);
    expect(byTitle.get(COMPLETED_TITLE)?.expired).toBe(false);
    expect(rows).toHaveLength(3);
  });

  it('is idempotent: a repeated run changes nothing and adds no rows', async () => {
    await runSeed();
    const target = createExpireTarget(todos());

    await target.start(
      {},
      { scheduleId: 'schedule-1', occurrenceId: 'occurrence-1' },
    );
    const second = await target.start(
      {},
      { scheduleId: 'schedule-1', occurrenceId: 'occurrence-2' },
    );

    expect(second.state === 'completed' && second.result?.expired).toBe(0);

    const rows = await todos().list();
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.expired)).toHaveLength(1);
  });
});
