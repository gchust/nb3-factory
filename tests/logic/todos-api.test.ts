// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import { describe, expect } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      // A browser writes with a cookie and sends its own origin; the test's in-process requests have to say which
      // origin they claim to be, and the application has to trust it, exactly as a deployment trusts its own.
      trustedOrigins: ['http://localhost'],
    },
  },
});

const TEST_ORIGIN = 'http://localhost';

const postTodo = (session: TestSession, body: unknown) =>
  session.fetch('/todos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
    body: JSON.stringify(body),
  });

const patchTodo = (session: TestSession, id: string, body: unknown) =>
  session.fetch(`/todos/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
    body: JSON.stringify(body),
  });

describe('todos HTTP API', () => {
  test('refuses an anonymous caller at every path', async ({ request }) => {
    expect((await request('/todos')).status).toBe(401);
    expect(
      (
        await request('/todos', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: TEST_ORIGIN,
          },
          body: JSON.stringify({
            title: 'x',
            dueAt: '2026-10-01T00:00:00.000Z',
          }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request('/todos/1', {
          method: 'PATCH',
          headers: { origin: TEST_ORIGIN },
          body: '{}',
        })
      ).status,
    ).toBe(401);
  });

  test('creates, lists and completes a todo for a signed-in user', async ({
    testApp,
  }) => {
    const session = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

    const created = await postTodo(session, {
      title: 'Prepare the release notes',
      dueAt: '2026-10-01T00:00:00.000Z',
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: {
        id: string;
        title: string;
        dueAt: string;
        completed: boolean;
        expired: boolean;
      };
    };
    expect(createdBody.data).toMatchObject({
      title: 'Prepare the release notes',
      dueAt: '2026-10-01T00:00:00.000Z',
      completed: false,
      expired: false,
    });
    expect(createdBody.data.id).toMatch(/^\d+$/u);

    const listed = await session.fetch('/todos?page=1&pageSize=20');
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      data: { id: string }[];
      meta: { total: number; page: number; pageSize: number };
    };
    expect(listedBody.meta).toMatchObject({ page: 1, pageSize: 20 });
    expect(listedBody.meta.total).toBeGreaterThanOrEqual(1);
    expect(listedBody.data.map((todo) => todo.id)).toContain(
      createdBody.data.id,
    );

    const completed = await patchTodo(session, createdBody.data.id, {
      completed: true,
    });
    expect(completed.status).toBe(200);
    const completedBody = (await completed.json()) as {
      data: { completed: boolean };
    };
    expect(completedBody.data.completed).toBe(true);
  });

  test('answers a missing todo with 404 and a domain reason', async ({
    testApp,
  }) => {
    const session = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const response = await patchTodo(session, '999999', { completed: true });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { reason: 'TODO_NOT_FOUND', domain: 'app' },
    });
  });

  test('rejects invalid input with 400 before the service is reached', async ({
    testApp,
  }) => {
    const session = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

    expect((await postTodo(session, {})).status).toBe(400);
    expect(
      (
        await postTodo(session, {
          title: '',
          dueAt: '2026-10-01T00:00:00.000Z',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await postTodo(session, {
          title: 'No offset',
          dueAt: '2026-10-01T00:00:00',
        })
      ).status,
    ).toBe(400);
    expect(
      (await patchTodo(session, 'not-a-number', { completed: true })).status,
    ).toBe(400);
    expect((await patchTodo(session, '1', { completed: 'yes' })).status).toBe(
      400,
    );
    expect((await session.fetch('/todos?pageSize=1000')).status).toBe(400);
  });
});
