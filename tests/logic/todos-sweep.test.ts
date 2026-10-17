// @vitest-environment node
import { randomUUID } from 'node:crypto';

import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import {
  SCHEDULE_KEY,
  TARGET_TYPE,
} from '../../server/providers/expire-todos-schedule.js';
import { todoServiceToken, type Todo } from '../../server/providers/todos.js';
import { createStandaloneServer } from '../../server/standalone.js';

/** A keyring like `config.yml`'s: the application refuses to start without one. */
const TEST_CONFIG = {
  // The origin the test's requests claim, so a cookie-authenticated write passes the application's origin check.
  app: { publicOrigin: 'http://localhost' },
  secrets: {
    keys: [
      {
        version: 1,
        key: '5c1f8f3d2a7b4e6c9d0a1b2c3d4e5f60718293a4b5c6d7e8f9012345678abcd',
      },
    ],
  },
};

/** One application for the whole file: it installs its migrations and seeds the way a deployment does. */
const test = createAppTest({
  createServer: createStandaloneServer,
  config: TEST_CONFIG,
});

/**
 * A write from the browser. The `origin` header is required: the application refuses a cookie-authenticated write whose
 * origin it does not trust, answering 403 `INVALID_CSRF_ORIGIN`.
 */
function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  };
}

interface TodoListBody {
  readonly data: Todo[];
  readonly meta: { page: number; pageSize: number; total: number };
}

interface ErrorBody {
  readonly error: { readonly reason: string; readonly domain: string };
}

test('answers a todo request without a session with 401', async ({
  request,
}) => {
  expect((await request('/todos')).status).toBe(401);
});

test('lists the seeded todos, soonest due first', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const response = await admin.fetch('/todos');
  expect(response.status).toBe(200);

  const body = (await response.json()) as TodoListBody;
  expect(body.meta.total).toBeGreaterThanOrEqual(3);
  expect(body.data.map((todo) => todo.title)).toEqual(
    expect.arrayContaining(['提交月度报表', '预约年度体检', '整理会议纪要']),
  );

  const dueTimes = body.data.map((todo) => Date.parse(todo.dueAt));
  expect(dueTimes).toEqual([...dueTimes].sort((left, right) => left - right));
});

test('creates, completes and validates a todo through its routes', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const created = await admin.fetch(
    '/todos',
    jsonRequest('POST', {
      title: '  交周报  ',
      dueAt: '2099-02-02T02:00:00.000Z',
    }),
  );
  expect(created.status).toBe(201);

  const { data: todo } = (await created.json()) as { data: Todo };
  expect(todo.title).toBe('交周报');
  expect(todo.completed).toBe(false);
  expect(todo.expired).toBe(false);

  const completed = await admin.fetch(
    `/todos/${todo.id}`,
    jsonRequest('PATCH', { completed: true }),
  );
  expect(completed.status).toBe(200);
  const { data: updated } = (await completed.json()) as { data: Todo };
  expect(updated).toMatchObject({ id: todo.id, completed: true });

  // `expired` belongs to the scheduled sweep, so the update schema rejects a client that tries to write it.
  const withExpired = await admin.fetch(
    `/todos/${todo.id}`,
    jsonRequest('PATCH', { completed: true, expired: true }),
  );
  expect(withExpired.status).toBe(400);

  const missing = await admin.fetch(
    `/todos/${randomUUID()}`,
    jsonRequest('PATCH', { completed: true }),
  );
  expect(missing.status).toBe(404);
  expect(((await missing.json()) as ErrorBody).error.reason).toBe(
    'TODO_NOT_FOUND',
  );
});

test('refuses a signed-in user who lacks the todo page grant', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const credentials = {
    email: 'todos-member@example.com',
    password: 'MemberPassword-123456',
  };
  const createdUser = await admin.fetch(
    '/users',
    jsonRequest('POST', { name: 'Todo Member', ...credentials }),
  );
  expect(createdUser.status).toBe(201);

  // A new user gets the built-in `member` set, which holds no page grants: the todo page and its API stay closed
  // until an administrator grants them.
  const member = await signIn(testApp, credentials);
  const forbidden = await member.fetch('/todos');
  expect(forbidden.status).toBe(403);
  expect(((await forbidden.json()) as ErrorBody).error).toMatchObject({
    reason: 'TODO_ACCESS_REQUIRED',
    domain: 'todos',
  });
});

test('marks only past-due open todos, and a second sweep changes nothing', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const service = testApp.application.container.resolve(todoServiceToken);

  const past = await service.create({
    title: `过期待办-${randomUUID()}`,
    dueAt: '2020-06-01T00:00:00.000Z',
  });
  const future = await service.create({
    title: `未来待办-${randomUUID()}`,
    dueAt: '2099-06-01T00:00:00.000Z',
  });
  const done = await service.create({
    title: `已完成待办-${randomUUID()}`,
    dueAt: '2020-06-01T00:00:00.000Z',
  });
  await service.setCompleted(done.id, true);

  await service.expireDue(new Date('2026-10-17T12:00:00.000Z'));

  const afterFirst = new Map(
    (await service.list()).map((todo) => [todo.id, todo]),
  );
  expect(afterFirst.get(past.id)?.expired).toBe(true);
  expect(afterFirst.get(future.id)?.expired).toBe(false);
  expect(afterFirst.get(done.id)?.expired).toBe(false);

  // The page shows what the sweep did.
  const listed = (await (await admin.fetch('/todos')).json()) as TodoListBody;
  expect(listed.data.find((todo) => todo.id === past.id)?.expired).toBe(true);

  // Nothing is left to mark, and the sweep neither inserts nor deletes: a retried or overlapping firing is harmless.
  const second = await service.expireDue(new Date('2026-10-17T12:00:00.000Z'));
  expect(second.expiredCount).toBe(0);

  const afterSecond = await service.list();
  expect(afterSecond.filter((todo) => todo.title === past.title)).toHaveLength(
    1,
  );
});

test('registers the expiry sweep as a schedule a reviewer can see', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const response = await admin.fetch('/scheduler/schedules?pageSize=100');
  expect(response.status).toBe(200);

  const { data: schedules } = (await response.json()) as {
    data: Array<{
      id: string;
      key: string;
      title: string;
      cron: string;
      timezone: string;
      enabled: boolean;
      targetState: string;
      nextRunAt?: string;
    }>;
  };

  const schedule = schedules.find((item) => item.key === SCHEDULE_KEY);
  expect(schedule).toBeDefined();
  expect(schedule).toMatchObject({
    title: '检查过期待办',
    cron: '* * * * *',
    timezone: 'UTC',
    enabled: true,
    // `ready` means the target the schedule names is registered and accepts the configuration it was defined with.
    targetState: 'ready',
  });
  expect(TARGET_TYPE).toBeDefined();
  expect(schedule?.nextRunAt).toBeTruthy();

  const occurrences = await admin.fetch(
    `/scheduler/schedules/${schedule!.id}/occurrences`,
  );
  expect(occurrences.status).toBe(200);
});

test('declares its routes in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);

  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  expect(document.paths?.['/api/todos']?.get?.operationId).toBe('todosList');
  expect(document.paths?.['/api/todos']?.post?.operationId).toBe('todosCreate');

  const patch = document.paths?.['/api/todos/{todoId}']?.patch;
  expect(patch?.operationId).toBe('todosSetCompleted');
  expect(Object.keys(patch?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '403',
    '404',
    '500',
  ]);
});
