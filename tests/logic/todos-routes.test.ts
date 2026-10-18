// @vitest-environment node
import path from 'node:path';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import { createAppPaths } from '@nocobase/app-server/config';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import type { DatabaseManager, MigrationSource } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Context, Hono, Next } from 'hono';
import { describe, expect } from 'vitest';

import { TodosService } from '../../server/providers/todos/service.js';
import { todosServiceToken } from '../../server/providers/todos/index.js';
import { todosApiRoutes } from '../../server/routes/todos.js';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'todos-routes-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const test = createDatabaseTest({ migrations: sources });

const HOUR = 60 * 60 * 1000;

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const testAuthentication = {
  required:
    () =>
    async (context: Context, next: Next): Promise<Response | void> => {
      if (context.req.header('x-test-user') !== 'tester') {
        return context.json({ error: 'unauthenticated' }, 401);
      }
      await next();
    },
};

async function createRouter(database: DatabaseManager): Promise<Hono> {
  const container = new ServiceContainer();
  container.instance(todosServiceToken, new TodosService(database));
  container.instance(authenticationToken, testAuthentication as never);

  const application = {
    appName: 'main',
    publicBasePath: '/main',
    config: { app: { name: 'main', publicBasePath: '/main' } },
    paths: createAppPaths({ rootDir: '/missing' }),
    container,
  } as unknown as Application;

  return await todosApiRoutes.createRouter(application);
}

const headers = {
  'x-test-user': 'tester',
  'content-type': 'application/json',
};

describe('todos API', () => {
  test('requires a session for every operation', async ({ database }) => {
    const router = await createRouter(database);

    expect((await router.request('/todos')).status).toBe(401);
    expect(
      (
        await router.request('/todos', {
          method: 'POST',
          body: JSON.stringify({ title: 'x', dueAt: iso(HOUR) }),
          headers: { 'content-type': 'application/json' },
        })
      ).status,
    ).toBe(401);
  });

  test('creates, reads, updates and deletes a todo', async ({ database }) => {
    const router = await createRouter(database);

    const createdResponse = await router.request('/todos', {
      method: 'POST',
      body: JSON.stringify({ title: '  Write tests  ', dueAt: iso(HOUR) }),
      headers,
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      data: {
        id: number;
        title: string;
        dueAt: string;
        completed: boolean;
        expired: boolean;
      };
    };
    expect(created.data.title).toBe('Write tests');
    expect(created.data.completed).toBe(false);
    expect(created.data.expired).toBe(false);

    const readResponse = await router.request(`/todos/${created.data.id}`, {
      headers,
    });
    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toMatchObject({
      data: { id: created.data.id, title: 'Write tests' },
    });

    const updatedResponse = await router.request(`/todos/${created.data.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: true }),
      headers,
    });
    expect(updatedResponse.status).toBe(200);
    await expect(updatedResponse.json()).resolves.toMatchObject({
      data: { id: created.data.id, completed: true, expired: false },
    });

    const deletedResponse = await router.request(`/todos/${created.data.id}`, {
      method: 'DELETE',
      headers,
    });
    expect(deletedResponse.status).toBe(204);
    expect(
      (await router.request(`/todos/${created.data.id}`, { headers })).status,
    ).toBe(404);
  });

  test('returns validation errors and a not-found error', async ({
    database,
  }) => {
    const router = await createRouter(database);

    expect(
      (
        await router.request('/todos', {
          method: 'POST',
          body: JSON.stringify({ title: 'missing due date' }),
          headers,
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await router.request('/todos', {
          method: 'POST',
          body: JSON.stringify({ title: 'x', dueAt: 'not-a-date' }),
          headers,
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await router.request('/todos/1', {
          method: 'PATCH',
          body: JSON.stringify({}),
          headers,
        })
      ).status,
    ).toBe(400);

    expect(
      (await router.request('/todos/not-a-number', { headers })).status,
    ).toBe(400);

    const missing = await router.request('/todos/9999', { headers });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { reason: 'TODO_NOT_FOUND' },
    });
  });

  test('lists earliest due first', async ({ database }) => {
    const service = new TodosService(database);
    const later = await service.create({
      title: 'later',
      dueAt: iso(3 * HOUR),
    });
    const earlier = await service.create({
      title: 'earlier',
      dueAt: iso(HOUR),
    });
    const router = await createRouter(database);

    const listResponse = await router.request('/todos', { headers });
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as {
      data: { id: number }[];
      meta: { total: number };
    };
    expect(list.data.map((todo) => todo.id)).toEqual([earlier.id, later.id]);
    expect(list.meta.total).toBe(2);
  });
});
