// @vitest-environment node

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationContext,
  type SeedContext,
} from '@nocobase/db';
import { sqliteDriver, type SqliteConnectionConfig } from '@nocobase/db-sqlite';
import type { Application } from '@nocobase/app-server/application';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import createTodosMigration from '../../database/main/migrations/20260927160000_create_todos.js';
import seedTodos from '../../database/main/seeds/20260927160001_seed_todos.js';
import {
  createTodoService,
  TodoTitleConflictError,
  todoServiceToken,
  type TodoService,
} from '../../server/providers/todos.js';
import { todosApiRoutes } from '../../server/routes/todos.js';

/**
 * A real SQLite database with the todos migration applied. The migration and
 * seed are the application's own sources, invoked through the same context the
 * Migrator and Seeder hand them, so this exercises their actual `up`/`run`
 * against a database rather than a description of them.
 */
interface TodosFixture {
  readonly database: DatabaseManager;
  readonly service: TodoService;
  readonly router: Hono;
}

let fixture: TodosFixture | undefined;
let databaseDir: string | undefined;

async function setUp(): Promise<TodosFixture> {
  const dir = mkdtempSync(path.join(tmpdir(), 'nocobase-todos-test-'));
  databaseDir = dir;
  const database = createDatabaseManager<SqliteConnectionConfig>({
    default: 'main',
    drivers: { sqlite: sqliteDriver },
    connections: {
      main: { dialect: 'sqlite', filename: path.join(dir, 'todos.sqlite') },
    },
  });

  await createTodosMigration.up(migrationContext(database));
  await seedTodos.run(seedContext(database));

  return {
    database,
    service: createTodoService(database),
    router: await createTodosRouter(database),
  };
}

/** The MigrationContext shape, with only the fields these sources read filled in. */
function migrationContext(database: DatabaseManager): MigrationContext {
  return {
    config: { get: () => undefined },
    container: unboundContainer(),
    builder: database.builder('main'),
    query: database.query('main'),
    repository: (collection: string) => database.repository(collection, 'main'),
    connection: database.connection('main'),
  };
}

/** The SeedContext shape, with only the fields this seed reads filled in. */
function seedContext(database: DatabaseManager): SeedContext {
  return {
    config: { get: () => undefined },
    container: unboundContainer(),
    repository: (collection: string) => database.repository(collection, 'main'),
    query: database.query('main'),
    connection: database.connection('main'),
  };
}

function unboundContainer(): MigrationContext['container'] {
  const fail = (): never => {
    throw new Error('This task does not resolve services.');
  };
  return {
    has: fail,
    resolve: fail,
    resolveIfCreated: fail,
  } as unknown as MigrationContext['container'];
}

beforeEach(async () => {
  fixture = await setUp();
});

afterEach(async () => {
  await fixture?.database.destroy();
  fixture = undefined;
  if (databaseDir) {
    rmSync(databaseDir, { recursive: true, force: true });
    databaseDir = undefined;
  }
});

describe('todos migration and seed', () => {
  it('seeds exactly the three records that exercise the scan', async () => {
    const todos = await fixture!.service.list();

    expect(todos).toHaveLength(3);
    expect(todos.map((todo) => todo.title)).toEqual([
      '过期待办（未完成）',
      '已完成待办（已过期但已完成）',
      '未来待办（未完成）',
    ]);
    expect(todos.every((todo) => todo.expired === false)).toBe(true);
  });

  it('drops the collection in down()', async () => {
    await createTodosMigration.down!(migrationContext(fixture!.database));

    await expect(fixture!.service.list()).rejects.toThrow();
  });
});

describe('todo service', () => {
  it('marks only overdue unfinished todos expired, and stays idempotent', async () => {
    const now = new Date('2025-01-01T00:00:00.000Z');

    await expect(fixture!.service.expireOverdue(now)).resolves.toBe(1);

    const afterFirstRun = await fixture!.service.list();
    const byTitle = byTitleMap(afterFirstRun);
    expect(byTitle.get('过期待办（未完成）')?.expired).toBe(true);
    expect(byTitle.get('未来待办（未完成）')?.expired).toBe(false);
    expect(byTitle.get('已完成待办（已过期但已完成）')?.expired).toBe(false);

    // A second run has nothing left to change, and it must not add a row.
    await expect(fixture!.service.expireOverdue(now)).resolves.toBe(0);
    await expect(fixture!.service.list()).resolves.toHaveLength(3);
  });

  it('leaves everything alone when no deadline has passed yet', async () => {
    const now = new Date('2010-01-01T00:00:00.000Z');

    await expect(fixture!.service.expireOverdue(now)).resolves.toBe(0);
    const todos = await fixture!.service.list();
    expect(todos.every((todo) => todo.expired === false)).toBe(true);
  });

  it('rejects a duplicate title and marks completion by id', async () => {
    await expect(
      fixture!.service.create({
        title: '过期待办（未完成）',
        dueAt: '2025-06-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(TodoTitleConflictError);

    const created = await fixture!.service.create({
      title: '手动新增待办',
      dueAt: '2025-06-01T00:00:00.000Z',
    });
    expect(created.completed).toBe(false);
    expect(created.expired).toBe(false);

    await expect(
      fixture!.service.setCompleted(created.id, true),
    ).resolves.toMatchObject({ id: created.id, completed: true });
    await expect(
      fixture!.service.setCompleted(created.id + 999, true),
    ).resolves.toBeUndefined();
  });
});

describe('todos routes', () => {
  it('requires a session', async () => {
    const response = await fixture!.router.request('/todos');
    expect(response.status).toBe(401);
  });

  it('lists the seeded todos for a signed-in user', async () => {
    const response = await fixture!.router.request('/todos', {
      headers: { 'x-test-session': 'ok' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { title: string }[] };
    expect(body.data).toHaveLength(3);
  });

  it('validates create input and rejects a duplicate title', async () => {
    const missing = await fixture!.router.request('/todos', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ title: '  ' }),
    });
    expect(missing.status).toBe(400);

    const created = await fixture!.router.request('/todos', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        title: '接口新增待办',
        dueAt: '2025-06-01T00:00:00.000Z',
      }),
    });
    expect(created.status).toBe(201);

    const duplicate = await fixture!.router.request('/todos', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        title: '接口新增待办',
        dueAt: '2025-06-01T00:00:00.000Z',
      }),
    });
    expect(duplicate.status).toBe(409);
  });

  it('validates the id and completion flag, and reports a missing record', async () => {
    const invalidId = await fixture!.router.request('/todos/abc', {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ completed: true }),
    });
    expect(invalidId.status).toBe(400);

    const invalidBody = await fixture!.router.request('/todos/1', {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ completed: 'yes' }),
    });
    expect(invalidBody.status).toBe(400);

    const missingRecord = await fixture!.router.request('/todos/99999', {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ completed: true }),
    });
    expect(missingRecord.status).toBe(404);

    const updated = await fixture!.router.request('/todos/1', {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ completed: true }),
    });
    expect(updated.status).toBe(200);
  });
});

/**
 * The application router wired to a fake container: the session guard is stood
 * in for by the `x-test-session` header, so the test does not need a running
 * authentication plugin. Everything below the guard is real — the route module
 * and the database-backed service it resolves.
 */
async function createTodosRouter(database: DatabaseManager): Promise<Hono> {
  const service = createTodoService(database);
  const container = {
    resolve: (token: unknown) => {
      if (token === authenticationToken) {
        return {
          required: () => async (context: Context, next: Next) => {
            if (context.req.header('x-test-session') !== 'ok') {
              return context.json({ code: 'UNAUTHENTICATED' }, 401);
            }
            await next();
          },
        };
      }
      if (token === todoServiceToken) {
        return service;
      }
      throw new Error('Unexpected service token in the todos route test.');
    },
  };

  const app = { container } as unknown as Application;
  return await todosApiRoutes.createRouter(app);
}

function jsonHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-test-session': 'ok',
  };
}

function byTitleMap(
  todos: Awaited<ReturnType<TodoService['list']>>,
): Map<string, (typeof todos)[number]> {
  return new Map(todos.map((todo) => [todo.title, todo]));
}
