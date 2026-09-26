// @vitest-environment node
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
  type DatabaseTaskConfig,
  type MigrationContext,
  type SeedContext,
} from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono, type Context, type Next } from 'hono';
import type { Knex } from 'knex';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609260001_create_todos.ts';
import seed from '../../database/main/seeds/202609260002_sample_todos.ts';
import {
  createTodoService,
  todoServiceToken,
} from '../../server/providers/todos.ts';
import { todoApiRoutes } from '../../server/routes/todos.ts';

const taskConfig: DatabaseTaskConfig = { get: () => undefined };

describe('todos', () => {
  let directory: string;
  let database: DatabaseManager;

  beforeEach(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'todos-test-'));
    database = createDatabaseManager({
      default: 'main',
      drivers: { sqlite },
      connections: {
        main: {
          dialect: 'sqlite',
          filename: path.join(directory, 'database.sqlite'),
          schemaManagement: 'managed',
        },
      },
    });
    await database.connect();
  });

  afterEach(async () => {
    await database.destroy();
    rmSync(directory, { recursive: true, force: true });
  });

  describe('migration', () => {
    it('creates the physical table, then removes it on rollback', async () => {
      const connection = database.connection();
      const client = await connection.client<Knex>();

      await migration.up(migrationContext(connection));
      expect(await client.schema.hasTable('todos')).toBe(true);

      const columns = await client.table('todos').columnInfo();
      expect(Object.keys(columns).sort()).toEqual([
        'completed',
        'created_at',
        'id',
        'title',
      ]);

      await migration.down?.(migrationContext(connection));
      expect(await client.schema.hasTable('todos')).toBe(false);
    });

    it('round-trips a record through the repository with the declared defaults', async () => {
      const connection = database.connection();
      await migration.up(migrationContext(connection));

      const created = await connection
        .repository<{
          id: number;
          title: string;
          completed: boolean;
          createdAt: Date | string;
        }>('todos')
        .createOne({
          values: {
            title: 'Write the report',
            completed: false,
            createdAt: new Date(),
          },
        });

      expect(created.record.id).toBeGreaterThan(0);
      expect(created.record.title).toBe('Write the report');
      expect(created.record.completed).toBe(false);
    });
  });

  describe('seed', () => {
    it('stays idempotent when the same seed runs twice', async () => {
      const connection = database.connection();
      await migration.up(migrationContext(connection));

      await seed.run(seedContext(connection));
      await seed.run(seedContext(connection));

      const todos = await createTodoService(database).list();
      expect(todos).toHaveLength(3);
      expect(todos.filter((todo) => todo.completed)).toHaveLength(1);
    });

    it('leaves the fixed sample content in place', async () => {
      const connection = database.connection();
      await migration.up(migrationContext(connection));
      await seed.run(seedContext(connection));

      const titles = (await createTodoService(database).list()).map(
        (todo) => todo.title,
      );
      expect(titles).toEqual([
        'Book a dentist appointment',
        'Buy groceries for the week',
        'Read the Q3 design doc',
      ]);
    });
  });

  describe('API', () => {
    let router: Hono;

    beforeEach(async () => {
      const connection = database.connection();
      await migration.up(migrationContext(connection));
      await seed.run(seedContext(connection));
      router = await todoApiRoutes.createRouter(
        createFakeApp(createTodoService(database)),
      );
    });

    it('rejects an anonymous request', async () => {
      const response = await router.request('/todos');
      expect(response.status).toBe(401);
    });

    it('lists the seeded to-dos newest first', async () => {
      const response = await signedIn('/todos');
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: { title: string }[] };
      expect(body.data.map((todo) => todo.title)).toEqual([
        'Book a dentist appointment',
        'Buy groceries for the week',
        'Read the Q3 design doc',
      ]);
    });

    it('refuses a blank title with a code the client can translate', async () => {
      for (const title of ['', '   ']) {
        const response = await signedIn('/todos', {
          method: 'POST',
          body: JSON.stringify({ title }),
        });
        expect(response.status).toBe(400);
        expect((await response.json()) as { code: string }).toMatchObject({
          code: 'TITLE_REQUIRED',
        });
      }

      // Nothing was created by the rejected attempts.
      const listed = await signedIn('/todos');
      const body = (await listed.json()) as { data: unknown[] };
      expect(body.data).toHaveLength(3);
    });

    it('adds a to-do and trims the title', async () => {
      const response = await signedIn('/todos', {
        method: 'POST',
        body: JSON.stringify({ title: '  Book the room  ' }),
      });
      expect(response.status).toBe(201);
      const body = (await response.json()) as {
        data: {
          id: number;
          title: string;
          completed: boolean;
          createdAt: string;
        };
      };
      expect(body.data.title).toBe('Book the room');
      expect(body.data.completed).toBe(false);
      expect(Number.isNaN(Date.parse(body.data.createdAt))).toBe(false);
    });

    it('marks a to-do complete and persists it', async () => {
      const listed = await signedIn('/todos');
      const before = (await listed.json()) as {
        data: { id: number; title: string; completed: boolean }[];
      };
      const target = before.data.find((todo) => !todo.completed);
      expect(target).toBeDefined();

      const response = await signedIn(`/todos/${target!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: true }),
      });
      expect(response.status).toBe(200);

      const after = await signedIn('/todos');
      const reloaded = (await after.json()) as {
        data: { id: number; completed: boolean }[];
      };
      expect(
        reloaded.data.find((todo) => todo.id === target!.id)?.completed,
      ).toBe(true);
    });

    it('reports an unknown to-do and a malformed body distinctly', async () => {
      const missing = await signedIn('/todos/999999', {
        method: 'PATCH',
        body: JSON.stringify({ completed: true }),
      });
      expect(missing.status).toBe(404);
      expect((await missing.json()) as { code: string }).toMatchObject({
        code: 'NOT_FOUND',
      });

      const invalid = await signedIn('/todos/1', {
        method: 'PATCH',
        body: JSON.stringify({ completed: 'yes' }),
      });
      expect(invalid.status).toBe(400);
      expect((await invalid.json()) as { code: string }).toMatchObject({
        code: 'INVALID_COMPLETED',
      });
    });

    function signedIn(
      pathName: string,
      init: RequestInit = {},
    ): Promise<Response> {
      return router.request(pathName, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-test-user': 'signed-in',
          ...init.headers,
        },
      });
    }
  });
});

function migrationContext(connection: DatabaseConnection): MigrationContext {
  return {
    config: taskConfig,
    container: new ServiceContainer(),
    builder: connection.builder,
    query: connection.query,
    repository: (collection) => connection.repository(collection),
    connection,
  };
}

function seedContext(connection: DatabaseConnection): SeedContext {
  return {
    config: taskConfig,
    container: new ServiceContainer(),
    repository: (collection) => connection.repository(collection),
    query: connection.query,
    connection,
  };
}

/**
 * A minimal stand-in for the running application: the route factory only reads
 * the container. The auth double answers `required()` with a middleware that
 * demands a test header, so the route's own guard is what is exercised.
 */
function createFakeApp(
  service: ReturnType<typeof createTodoService>,
): Application {
  const container = new ServiceContainer();
  container.instance(todoServiceToken, service);
  container.instance(authenticationToken, {
    required() {
      return async (context: Context, next: Next) => {
        if (context.req.header('x-test-user') !== 'signed-in') {
          return context.json({ code: 'UNAUTHORIZED' }, 401);
        }
        await next();
      };
    },
  } as unknown as Auth);
  return { container } as unknown as Application;
}
