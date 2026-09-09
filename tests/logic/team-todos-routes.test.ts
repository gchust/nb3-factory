import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { createAppMigrator } from '@nocobase/app-server/database';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { teamTodoApiRoutes } from '../../server/routes/team-todos.js';
import {
  teamTodoServiceToken,
  TeamTodoService,
} from '../../server/providers/team-todos.js';

const migrationsDirectory = path.resolve(
  import.meta.dirname,
  '../../database/migrations',
);

/** Stand-in for the real Auth middleware: rejects anonymous requests with 401. */
function createFakeAuth() {
  return {
    required:
      () =>
      async (context: import('hono').Context, next: () => Promise<void>) => {
        if (context.req.header('authorization') === 'Bearer valid-session') {
          context.set('auth', {
            user: { id: 'user-1', email: 'qa@example.com' },
            session: { id: 'session-1' },
          });
          await next();
          return;
        }
        return context.json(
          { error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } },
          401,
        );
      },
  };
}

describe('team todos API routes', () => {
  let database: DatabaseManager;
  let service: TeamTodoService;
  let tempDir: string;
  let router: import('hono').Hono;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'team-todos-routes-'));
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: path.join(tempDir, 'test.sqlite'),
        },
      },
    });
    await database.connect();
    await createAppMigrator({
      database,
      config: {
        directory: migrationsDirectory,
        packageName: 'nb3-factory',
        autoRun: true,
      },
    }).latest();
    service = new TeamTodoService(database);

    const container = new ServiceContainer();
    container.instance(authenticationToken, createFakeAuth() as never);
    container.instance(teamTodoServiceToken, service);

    router = await teamTodoApiRoutes.createRouter({
      container,
    } as never);
  });

  afterEach(async () => {
    await database.destroy();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function request(
    method: string,
    url: string,
    options: { body?: unknown; authenticated?: boolean } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (options.authenticated) {
      headers.authorization = 'Bearer valid-session';
    }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    return router.request(url, {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  it('rejects anonymous requests with 401', async () => {
    for (const [method, url] of [
      ['GET', '/team-todos'],
      ['POST', '/team-todos'],
      ['PUT', '/team-todos/1'],
      ['DELETE', '/team-todos/1'],
    ] as const) {
      const response = await request(method, url);
      expect(response.status, `${method} ${url}`).toBe(401);
    }
  });

  it('creates, lists, updates and deletes a todo for an authenticated user', async () => {
    const createResponse = await request('POST', '/team-todos', {
      authenticated: true,
      body: { title: '写周报', description: '汇总进展', priority: 'urgent' },
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      data: { id: number; title: string; status: string; priority: string };
    };
    expect(created.data.title).toBe('写周报');
    expect(created.data.status).toBe('pending');
    expect(created.data.priority).toBe('urgent');

    const listResponse = await request('GET', '/team-todos', {
      authenticated: true,
    });
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as {
      data: unknown[];
      stats: { all: number; pending: number };
    };
    expect(list.data).toHaveLength(1);
    expect(list.stats).toEqual({
      all: 1,
      pending: 1,
      inProgress: 0,
      completed: 0,
    });

    const updateResponse = await request(
      'PUT',
      `/team-todos/${created.data.id}`,
      {
        authenticated: true,
        body: { status: 'completed' },
      },
    );
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()) as {
      data: { id: number; status: string };
    };
    expect(updated.data.status).toBe('completed');

    const deleteResponse = await request(
      'DELETE',
      `/team-todos/${created.data.id}`,
      { authenticated: true },
    );
    expect(deleteResponse.status).toBe(200);

    const afterDelete = await request('GET', '/team-todos', {
      authenticated: true,
    });
    const after = (await afterDelete.json()) as { data: unknown[] };
    expect(after.data).toHaveLength(0);
  });

  it('supports search and status filter query parameters', async () => {
    await request('POST', '/team-todos', {
      authenticated: true,
      body: { title: '修复登录页' },
    });
    await request('POST', '/team-todos', {
      authenticated: true,
      body: { title: '写文档', status: 'completed' },
    });

    const searchResponse = await request(
      'GET',
      '/team-todos?search=%E4%BF%AE%E5%A4%8D',
      { authenticated: true },
    );
    const search = (await searchResponse.json()) as {
      data: { title: string }[];
    };
    expect(search.data.map((todo) => todo.title)).toEqual(['修复登录页']);

    const filterResponse = await request(
      'GET',
      '/team-todos?status=completed',
      {
        authenticated: true,
      },
    );
    const filtered = (await filterResponse.json()) as {
      data: { title: string }[];
      stats: { all: number };
    };
    expect(filtered.data.map((todo) => todo.title)).toEqual(['写文档']);
    expect(filtered.stats.all).toBe(2);
  });

  it('returns 400 for an empty title and 404 for a missing todo', async () => {
    const invalid = await request('POST', '/team-todos', {
      authenticated: true,
      body: { title: '   ' },
    });
    expect(invalid.status).toBe(400);
    const invalidBody = (await invalid.json()) as { error: { code: string } };
    expect(invalidBody.error.code).toBe('TITLE_REQUIRED');

    const missing = await request('PUT', '/team-todos/9999', {
      authenticated: true,
      body: { title: 'x' },
    });
    expect(missing.status).toBe(404);
  });
});
