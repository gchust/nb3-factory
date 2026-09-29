// Exercises the todo feature end to end: the migration creates the table, the
// seed inserts the three example rows, and the HTTP routes enforce the session
// before reading or writing anything.
//
// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MigrationContext, SeedContext } from '@nocobase/db';

import exampleSeed from '../../database/main/seeds/202609290002_example_todos.ts';
import exampleMigration from '../../database/main/migrations/202609290001_create_todos.ts';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

const sourceRoot = path.resolve(import.meta.dirname, '../..');
const ADMIN = { username: 'nocobase', password: 'admin123' };

interface TodoView {
  id: number;
  title: string;
  notes: string | null;
  completed: boolean;
  createdAt: string;
}

interface TodoListBody {
  data: TodoView[];
}

interface TodoBody {
  data: TodoView;
}

interface ErrorBody {
  code: string;
  message: string;
}

let server: StandaloneServer;
let baseUrl: string;
let cookie: string;
let dataDir: string;

function writeConfig(directory: string): string {
  const file = path.join(directory, 'config.json');
  writeFileSync(
    file,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(directory, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );
  return file;
}

async function api(
  pathname: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (authenticated) {
    headers.set('cookie', cookie);
    // A cookie-authenticated write is rejected unless its origin is trusted.
    headers.set('origin', 'http://localhost');
  }
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return server.fetch(
    new Request(`${baseUrl}${pathname}`, { ...init, headers }),
  );
}

async function jsonBody<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function signIn(): Promise<string> {
  const response = await api(
    '/api/auth/sign-in/username',
    {
      method: 'POST',
      body: JSON.stringify(ADMIN),
    },
    false,
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'nocobase-todos-test-'));
  server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      // The session cookie write guard rejects an untrusted origin; a deployment sets this too.
      APP_PUBLIC_ORIGIN: 'http://localhost',
      APP_CONFIG_FILE: writeConfig(dataDir),
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: path.join(dataDir, 'storage'),
    },
  });
  baseUrl = `http://localhost${server.application.publicBasePath}`;
  cookie = await signIn();
});

afterAll(async () => {
  await server?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('todos API', () => {
  it('rejects an anonymous request before touching the data', async () => {
    const response = await api('/api/todos', {}, false);
    expect(response.status).toBe(401);
  });

  it('lists the three example todos newest first', async () => {
    const response = await api('/api/todos');
    expect(response.status).toBe(200);
    const { data } = await jsonBody<TodoListBody>(response);

    expect(data.map((todo) => todo.title)).toEqual([
      "Prepare Monday's team meeting",
      'Book a dentist appointment',
      'Buy groceries',
    ]);
    expect(data.map((todo) => todo.completed)).toEqual([false, true, false]);

    const timestamps = data.map((todo) => Date.parse(todo.createdAt));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
    for (const todo of data) {
      expect(Number.isNaN(Date.parse(todo.createdAt))).toBe(false);
      // `seedKey` is an implementation detail of the seed and never leaves the server.
      expect(todo).not.toHaveProperty('seedKey');
    }
  });

  it('filters by status and rejects an unknown status', async () => {
    const active = await jsonBody<TodoListBody>(
      await api('/api/todos?status=active'),
    );
    expect(active.data).toHaveLength(2);
    expect(active.data.every((todo) => !todo.completed)).toBe(true);

    const completed = await jsonBody<TodoListBody>(
      await api('/api/todos?status=completed'),
    );
    expect(completed.data).toHaveLength(1);
    expect(completed.data.every((todo) => todo.completed)).toBe(true);

    const invalid = await api('/api/todos?status=bogus');
    expect(invalid.status).toBe(400);
    await expect(jsonBody<ErrorBody>(invalid)).resolves.toMatchObject({
      code: 'INVALID_TODO_INPUT',
    });
  });

  it('creates, updates and deletes a todo', async () => {
    const createdResponse = await api('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ title: '  Write the report  ', notes: '   ' }),
    });
    expect(createdResponse.status).toBe(201);
    const { data: created } = await jsonBody<TodoBody>(createdResponse);
    expect(created).toMatchObject({
      title: 'Write the report',
      notes: null,
      completed: false,
    });
    // The service stamps creation time itself; a fixed seed timestamp must not be reused.
    expect(Math.abs(Date.now() - Date.parse(created.createdAt))).toBeLessThan(
      60_000,
    );

    const listed = await jsonBody<TodoListBody>(await api('/api/todos'));
    // Assert sorting independently of the example rows' fixed timestamps.
    expect(listed.data.some((todo) => todo.id === created.id)).toBe(true);
    const listedTimestamps = listed.data.map((todo) =>
      Date.parse(todo.createdAt),
    );
    expect(listedTimestamps).toEqual(
      [...listedTimestamps].sort((a, b) => b - a),
    );

    const toggled = await jsonBody<TodoBody>(
      await api(`/api/todos/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: true }),
      }),
    );
    expect(toggled.data.completed).toBe(true);

    const edited = await jsonBody<TodoBody>(
      await api(`/api/todos/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Write the final report',
          notes: 'Include numbers.',
        }),
      }),
    );
    expect(edited.data).toMatchObject({
      title: 'Write the final report',
      notes: 'Include numbers.',
      completed: true,
    });

    const fetched = await api(`/api/todos/${created.id}`);
    expect(fetched.status).toBe(200);

    const deleted = await api(`/api/todos/${created.id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(204);

    const gone = await api(`/api/todos/${created.id}`);
    expect(gone.status).toBe(404);
    await expect(jsonBody<ErrorBody>(gone)).resolves.toMatchObject({
      code: 'TODO_NOT_FOUND',
    });
  });

  it('validates input and unknown identifiers', async () => {
    const missingTitle = await api('/api/todos', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(missingTitle.status).toBe(400);

    const longTitle = await api('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ title: 'x'.repeat(256) }),
    });
    expect(longTitle.status).toBe(400);

    expect((await api('/api/todos/abc')).status).toBe(400);
    expect((await api('/api/todos/999999')).status).toBe(404);
    expect(
      (
        await api('/api/todos/999999', {
          method: 'PATCH',
          body: JSON.stringify({ completed: true }),
        })
      ).status,
    ).toBe(404);
    expect((await api('/api/todos/999999', { method: 'DELETE' })).status).toBe(
      404,
    );
  });
});

describe('example todos seed', () => {
  interface SeedRow {
    id: number;
    seedKey: string;
    title: string;
    notes: string | null;
    completed: boolean;
    createdAt: Date;
  }

  function createFakeRepository(): {
    rows: SeedRow[];
    context: SeedContext;
  } {
    const rows: SeedRow[] = [];
    const repository = {
      findOne: async (options: {
        filter: { seedKey: string };
      }): Promise<SeedRow | undefined> =>
        rows.find((row) => row.seedKey === options.filter.seedKey),
      createOne: async (options: {
        values: Omit<SeedRow, 'id'>;
      }): Promise<{ record: SeedRow }> => {
        const record: SeedRow = { id: rows.length + 1, ...options.values };
        rows.push(record);
        return { record };
      },
    };
    return {
      rows,
      context: {
        repository: () => repository,
      } as unknown as SeedContext,
    };
  }

  it('inserts three rows once and never overwrites a later edit', async () => {
    const { rows, context } = createFakeRepository();

    await exampleSeed.run(context);
    expect(rows.map((row) => row.seedKey)).toEqual([
      'example-1',
      'example-2',
      'example-3',
    ]);

    const edited = rows[0];
    edited.title = 'Buy a different kind of groceries';

    await exampleSeed.run(context);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.title).toBe('Buy a different kind of groceries');
  });
});

describe('todos migration', () => {
  interface FakeField {
    name: string;
    options?: Record<string, unknown>;
    unique?: boolean;
    nullable?: boolean;
  }

  function createBuilder(): {
    created: { name: string; fields: FakeField[] }[];
    dropped: string[];
    builder: MigrationContext['builder'];
  } {
    const created: { name: string; fields: FakeField[] }[] = [];
    const dropped: string[] = [];

    const collection = {
      increments: (name: string): void => {
        created.at(-1)?.fields.push({ name });
      },
      string: (name: string, options?: Record<string, unknown>) => {
        const field: FakeField = { name, options };
        created.at(-1)?.fields.push(field);
        return {
          unique: (): void => {
            field.unique = true;
          },
        };
      },
      text: (name: string, options?: Record<string, unknown>): void => {
        created.at(-1)?.fields.push({ name, options });
      },
      boolean: (name: string, options?: Record<string, unknown>): void => {
        created.at(-1)?.fields.push({ name, options });
      },
      datetime: (name: string, options?: Record<string, unknown>): void => {
        created.at(-1)?.fields.push({ name, options });
      },
    };

    const builder = {
      createCollection: async (
        name: string,
        configure: (value: typeof collection) => void,
      ): Promise<void> => {
        created.push({ name, fields: [] });
        configure(collection);
      },
      dropCollection: async (name: string): Promise<void> => {
        dropped.push(name);
      },
    } as unknown as MigrationContext['builder'];

    return { created, dropped, builder };
  }

  it('creates the todos table with the fields the routes rely on, and drops it on down', async () => {
    const { created, dropped, builder } = createBuilder();

    await exampleMigration.up({ builder } as MigrationContext);
    expect(created).toHaveLength(1);
    const [table] = created;
    expect(table?.name).toBe('todos');
    expect(table?.fields.map((field) => field.name)).toEqual([
      'id',
      'title',
      'notes',
      'completed',
      'seedKey',
      'createdAt',
    ]);
    expect(
      table?.fields.find((field) => field.name === 'seedKey')?.unique,
    ).toBe(true);
    expect(
      table?.fields.find((field) => field.name === 'title')?.options?.nullable,
    ).toBe(false);

    await exampleMigration.down?.({ builder } as MigrationContext);
    expect(dropped).toEqual(['todos']);
  });
});
