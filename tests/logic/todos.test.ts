// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Auth, AuthEnv } from '@nocobase/app-plugin-authentication';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import type { MiddlewareHandler } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createTodoService,
  TodoTitleRequiredError,
} from '../../server/providers/todo.js';
import { createTodoRoutes } from '../../server/routes/todos.js';

const applicationRoot = fileURLToPath(new URL('../..', import.meta.url));
const migrationDirectory = path.join(
  applicationRoot,
  'database',
  'main',
  'migrations',
);
const seedDirectory = path.join(applicationRoot, 'database', 'main', 'seeds');

const MIGRATION_NAME = '20260926000001_create_todos';
const SEED_NAME = '20260926000001_sample_todos';

interface TodoRow {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: string | Date;
}

let directory: string;
let database: DatabaseManager;

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'nb3-todos-'));
  database = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        ...sqlite({ filename: path.join(directory, 'todos.sqlite') }),
        schemaManagement: 'managed',
      },
    },
    metadataStore: new InMemoryCollectionMetadataStore(),
  });
  await database
    .createMigrator({ packageName: 'app', directory: migrationDirectory })
    .latest();
});

afterEach(async () => {
  await database.destroy();
  rmSync(directory, { recursive: true, force: true });
});

describe('the todos migration', () => {
  it('creates the Collection and drops it again in down', async () => {
    expect(await database.collections('main').get('todos')).toBeDefined();

    const rolledBack = await database
      .createMigrator({ packageName: 'app', directory: migrationDirectory })
      .rollback();

    expect(rolledBack.rolledBack).toContain(MIGRATION_NAME);
    expect(await database.collections('main').get('todos')).toBeUndefined();
  });
});

describe('the sample to-dos seed', () => {
  it('inserts three to-dos with exactly one completed, and is idempotent', async () => {
    const seeder = database.createSeeder({
      packageName: 'app',
      directory: seedDirectory,
    });

    const first = await seeder.run();
    expect(first.executed).toContain(SEED_NAME);

    const rows = await database.repository<TodoRow>('todos').findMany();
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.completed)).toHaveLength(1);

    // A second run is the observable half of idempotency: the Seeder's history skips it, and the seed's own
    // existence check would keep it harmless even if the history were lost.
    const second = await seeder.run();
    expect(second.executed).toEqual([]);
    await expect(database.repository('todos').count()).resolves.toBe(3);
  });
});

describe('the to-do service', () => {
  it('creates a to-do with a trimmed title and lists newest first', async () => {
    const todos = createTodoService(database);
    const first = await todos.create('  First task  ');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await todos.create('Second task');

    expect(first).toMatchObject({ title: 'First task', completed: false });
    expect(second.title).toBe('Second task');

    const listed = await todos.list();
    expect(listed.map((todo) => todo.title)).toEqual([
      'Second task',
      'First task',
    ]);
    expect(listed[0]?.id).toBe(second.id);
  });

  it('rejects a title that is empty once trimmed', async () => {
    const todos = createTodoService(database);
    await expect(todos.create('   ')).rejects.toBeInstanceOf(
      TodoTitleRequiredError,
    );
  });

  it('persists a completed toggle across a fresh read', async () => {
    const created = await createTodoService(database).create('Walk the dog');

    const updated = await createTodoService(database).setCompleted(
      created.id,
      true,
    );
    expect(updated).toMatchObject({ id: created.id, completed: true });

    // A second service over the same database stands in for the page reloading: the change is stored, not held in
    // memory.
    const reread = await createTodoService(database).list();
    expect(reread).toEqual([
      expect.objectContaining({ id: created.id, completed: true }),
    ]);

    const toggledBack = await createTodoService(database).setCompleted(
      created.id,
      false,
    );
    expect(toggledBack?.completed).toBe(false);
  });

  it('resolves undefined for an unknown id', async () => {
    const todos = createTodoService(database);
    await expect(todos.setCompleted(999_999, true)).resolves.toBeUndefined();
  });
});

/** Stands in for the authentication plugin: a missing test header is an anonymous request. */
function createFakeAuth(): Pick<Auth, 'required'> {
  const required = (): MiddlewareHandler<AuthEnv> => (context, next) => {
    if (context.req.header('x-test-user') !== 'member') {
      return context.json(
        { code: 'UNAUTHENTICATED', error: 'Authentication required.' },
        401,
      );
    }
    return next();
  };
  return { required };
}

describe('the to-do routes', () => {
  const authorized = { 'x-test-user': 'member' };
  const json = { 'content-type': 'application/json' };

  function routes() {
    return createTodoRoutes({
      auth: createFakeAuth(),
      todos: createTodoService(database),
    });
  }

  it('rejects an anonymous read with 401', async () => {
    const response = await routes().request('/todos');
    expect(response.status).toBe(401);
  });

  it('lists to-dos for an authenticated request', async () => {
    await createTodoService(database).create('Buy milk');

    const response = await routes().request('/todos', {
      headers: authorized,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: readonly { title: string }[];
    };
    expect(body.data.map((todo) => todo.title)).toEqual(['Buy milk']);
  });

  it('creates a to-do and answers 201', async () => {
    const response = await routes().request('/todos', {
      method: 'POST',
      headers: { ...authorized, ...json },
      body: JSON.stringify({ title: '  Water the plants  ' }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      data: { title: string; completed: boolean };
    };
    expect(body.data).toMatchObject({
      title: 'Water the plants',
      completed: false,
    });
  });

  it('rejects an empty title with 400', async () => {
    const response = await routes().request('/todos', {
      method: 'POST',
      headers: { ...authorized, ...json },
      body: JSON.stringify({ title: '   ' }),
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: 'TODO_TITLE_REQUIRED',
    });
  });

  it('toggles a to-do and answers 404 for an unknown id', async () => {
    const created = await createTodoService(database).create('Read a book');

    const toggled = await routes().request(`/todos/${created.id}`, {
      method: 'PATCH',
      headers: { ...authorized, ...json },
      body: JSON.stringify({ completed: true }),
    });
    expect(toggled.status).toBe(200);
    expect(
      ((await toggled.json()) as { data: { completed: boolean } }).data
        .completed,
    ).toBe(true);

    const missing = await routes().request('/todos/999999', {
      method: 'PATCH',
      headers: { ...authorized, ...json },
      body: JSON.stringify({ completed: true }),
    });
    expect(missing.status).toBe(404);
  });

  it('rejects a toggle without a boolean completed flag', async () => {
    const response = await routes().request('/todos/1', {
      method: 'PATCH',
      headers: { ...authorized, ...json },
      body: JSON.stringify({ completed: 'yes' }),
    });
    expect(response.status).toBe(400);
  });

  it('rejects an anonymous write with 401 and stores nothing', async () => {
    const response = await routes().request('/todos', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ title: 'Sneaky' }),
    });

    expect(response.status).toBe(401);
    await expect(database.repository('todos').count()).resolves.toBe(0);
  });
});
