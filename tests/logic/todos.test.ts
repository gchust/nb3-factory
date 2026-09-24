// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import {
  createDatabaseManager,
  createMigrator,
  createSeeder,
  databaseManagerToken,
  type DatabaseManager,
  type SeedContext,
} from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono, type Context, type Next } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import seedDefinition from '../../database/main/seeds/202609240002_seed_todos.js';
import {
  TODO_EXPIRY_SCHEDULE_KEY,
  TODO_EXPIRY_TARGET_TYPE,
  TodoProvider,
  TodoService,
  todoServiceToken,
} from '../../server/providers/todo.js';
import { todosApiRoutes } from '../../server/routes/todos.js';

const applicationRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const migrationsDirectory = path.join(
  applicationRoot,
  'database',
  'main',
  'migrations',
);
const seedsDirectory = path.join(applicationRoot, 'database', 'main', 'seeds');

const databases: DatabaseManager[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * An isolated SQLite database with the feature's migration applied. A file in a
 * temporary directory rather than `:memory:`, so the migrator, the seeder and
 * the service all see one database no matter how they pool connections.
 */
async function databaseWithSchema(): Promise<DatabaseManager> {
  const directory = mkdtempSync(path.join(tmpdir(), 'nb3-todos-'));
  directories.push(directory);
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: sqlite({ filename: path.join(directory, 'database.sqlite') }),
    },
  });
  databases.push(database);
  await createMigrator({
    database,
    directory: migrationsDirectory,
    packageName: 'app',
  }).latest();
  return database;
}

async function databaseWithSeed(): Promise<DatabaseManager> {
  const database = await databaseWithSchema();
  await createSeeder({
    database,
    directory: seedsDirectory,
    packageName: 'app',
  }).run();
  return database;
}

function seedContext(database: DatabaseManager): SeedContext {
  return {
    config: {},
    container: new ServiceContainer(),
    repository: (collection: string) => database.repository(collection),
    query: database.query(),
    connection: database.connection(),
  } as unknown as SeedContext;
}

describe('todos migration and seed', () => {
  it('creates the table, keeps the seed idempotent, and drops the table on down', async () => {
    const database = await databaseWithSchema();
    await createSeeder({
      database,
      directory: seedsDirectory,
      packageName: 'app',
    }).run();

    const service = new TodoService(database);
    const afterSeed = await service.list();
    expect(afterSeed).toHaveLength(3);
    expect(afterSeed.map((todo) => todo.title)).toEqual(
      expect.arrayContaining([
        'Submit the quarterly report',
        'Prepare next sprint backlog',
        'Archive last year documents',
      ]),
    );

    // The seeder records the seed as executed, so running it again is a no-op.
    // Invoking the definition directly bypasses that history and exercises the
    // upsert itself: a second run must update the same three rows, not add more.
    await seedDefinition.run(seedContext(database));
    expect(await service.list()).toHaveLength(3);

    const rolledBack = await createMigrator({
      database,
      directory: migrationsDirectory,
      packageName: 'app',
    }).rollback();
    expect(rolledBack.rolledBack).toContain('202609240001_create_todos');
    await expect(database.repository('todos').findMany()).rejects.toThrow();
  });
});

describe('TodoService expiry', () => {
  it('expires only the overdue incomplete todo, and stays settled when run again', async () => {
    const database = await databaseWithSeed();
    const service = new TodoService(database);

    expect(await service.markExpired()).toEqual({ marked: 1 });

    const expired = await service.list();
    expect(
      expired.find((todo) => todo.title === 'Submit the quarterly report')
        ?.expired,
    ).toBe(true);
    expect(
      expired.find((todo) => todo.title === 'Prepare next sprint backlog')
        ?.expired,
    ).toBe(false);
    // A past deadline alone is not enough: this one is already completed.
    expect(
      expired.find((todo) => todo.title === 'Archive last year documents')
        ?.expired,
    ).toBe(false);

    // Running the plan again reports nothing new and adds no rows.
    expect(await service.markExpired()).toEqual({ marked: 0 });
    expect(await service.list()).toHaveLength(3);
  });

  it('creates todos and toggles completion', async () => {
    const database = await databaseWithSeed();
    const service = new TodoService(database);

    const created = await service.create({
      title: 'Write the retro',
      dueAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    expect(created.completed).toBe(false);
    expect(created.expired).toBe(false);
    expect(await service.list()).toHaveLength(4);

    const completed = await service.setCompleted(created.id, true);
    expect(completed.completed).toBe(true);

    await expect(service.setCompleted(999999, true)).rejects.toMatchObject({
      code: 'RECORD_NOT_FOUND',
    });
  });
});

describe('scheduled plan registration', () => {
  it('registers the target and plan, and the plan marks the overdue todo', async () => {
    const database = await databaseWithSeed();
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, database);
    const scheduler = { registerTarget: vi.fn(), defineSchedule: vi.fn() };
    container.instance(schedulerServiceToken, scheduler as never);

    const provider = new TodoProvider({ container } as never);
    provider.register();
    await provider.boot();

    expect(scheduler.registerTarget).toHaveBeenCalledTimes(1);
    const target = scheduler.registerTarget.mock.calls[0]![0];
    expect(target.type).toBe(TODO_EXPIRY_TARGET_TYPE);
    expect(target.title).toBe('检查过期待办');
    expect(target.validate({})).toEqual({ valid: true });
    expect(target.validate(null)).toMatchObject({ valid: false });

    expect(scheduler.defineSchedule).toHaveBeenCalledTimes(1);
    const definition = scheduler.defineSchedule.mock.calls[0]![0];
    expect(definition.key).toBe(TODO_EXPIRY_SCHEDULE_KEY);
    expect(definition.title).toBe('检查过期待办');
    expect(definition.schedule).toMatchObject({
      cron: '* * * * *',
      timezone: 'UTC',
    });
    expect(definition.target.type).toBe(TODO_EXPIRY_TARGET_TYPE);

    // The plan reaches the todos through the registered target, which resolves
    // the same service the page's endpoints use.
    const outcome = await target.start(
      {},
      { scheduleId: 'schedule-1', occurrenceId: 'occurrence-1' },
    );
    expect(outcome).toEqual({
      state: 'completed',
      outcome: 'succeeded',
      result: { marked: 1 },
    });

    const rows = await new TodoService(database).list();
    expect(
      rows.filter((todo) => todo.expired).map((todo) => todo.title),
    ).toEqual(['Submit the quarterly report']);
  });
});

describe('todos API routes', () => {
  /** The route mounted the way the application mounts an `/api` contribution. */
  async function buildHttp(database: DatabaseManager): Promise<Hono> {
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, database);
    container.instance(todoServiceToken, new TodoService(database));
    // The session check belongs to the authentication plugin, which tests it on
    // its own. This stands in for its contract: reject without a session, pass
    // through with one, so the route's own behavior is what is under test.
    container.instance(authenticationToken, {
      required: () => async (context: Context, next: Next) => {
        if (context.req.header('x-test-session') !== 'user-1') {
          return context.json({ code: 'UNAUTHORIZED' }, 401);
        }
        await next();
      },
    } as never);

    const router = await todosApiRoutes.createRouter({ container } as never);
    return new Hono().route('/api', router);
  }

  const session = { 'x-test-session': 'user-1' };
  const json = { ...session, 'content-type': 'application/json' };

  it('rejects every endpoint without a session', async () => {
    const http = await buildHttp(await databaseWithSeed());

    for (const [method, requestPath] of [
      ['GET', '/api/todos'],
      ['POST', '/api/todos'],
      ['PATCH', '/api/todos/1'],
    ] as const) {
      const response = await http.request(requestPath, { method });
      expect(response.status).toBe(401);
    }
  });

  it('lists todos for a signed-in caller', async () => {
    const http = await buildHttp(await databaseWithSeed());
    const response = await http.request('/api/todos', { headers: session });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(3);
  });

  it('validates and creates a todo', async () => {
    const http = await buildHttp(await databaseWithSeed());

    const invalid = await http.request('/api/todos', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ title: '   ' }),
    });
    expect(invalid.status).toBe(400);

    const created = await http.request('/api/todos', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        title: 'Review the pull request',
        dueAt: '2026-09-25T00:00:00.000Z',
      }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      data: { title: string; completed: boolean };
    };
    expect(body.data.title).toBe('Review the pull request');
    expect(body.data.completed).toBe(false);
  });

  it('updates completion, validates the body, and reports a missing todo', async () => {
    const http = await buildHttp(await databaseWithSeed());
    const listed = (await (
      await http.request('/api/todos', { headers: session })
    ).json()) as { data: Array<{ id: number }> };
    const target = listed.data[0]!;

    const patched = await http.request(`/api/todos/${target.id}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ completed: true }),
    });
    expect(patched.status).toBe(200);
    expect(
      (await patched.json()) as { data: { completed: boolean } },
    ).toMatchObject({ data: { completed: true } });

    const invalid = await http.request(`/api/todos/${target.id}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ completed: 'yes' }),
    });
    expect(invalid.status).toBe(400);

    const missing = await http.request('/api/todos/999999', {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ completed: true }),
    });
    expect(missing.status).toBe(404);
  });
});
