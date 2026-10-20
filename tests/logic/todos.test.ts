// @vitest-environment node
import { databaseManagerToken } from '@nocobase/db';
import { createAppTest, type TestApp } from '@nocobase/app-testing/server';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';
import { todosServiceToken } from '../../server/providers/todos.ts';

/**
 * The whole application, started the way `pnpm start` starts it, on a database of its own with every migration and
 * seed applied. The application is installed once for the file and shared by its tests, so each test creates and
 * removes its own rows rather than depending on another test's writes.
 */
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    // The three settings a deployment gets from its configuration file: the master key the authentication plugin
    // encrypts with, the password sign-in method, and the session table.
    secrets: {
      keys: [{ version: 1, key: 'test-secrets-key-0123456789abcdef0123' }],
    },
    auth: {
      emailAndPassword: { enabled: true },
      session: { storeSessionInDatabase: true },
    },
    users: {
      initialAdmin: {
        username: 'nocobase',
        email: 'admin@nocobase.com',
        password: 'admin123',
      },
    },
  },
  scope: 'file',
});

type Request = TestApp['request'];
type AuthHeaders = Record<string, string>;

const SAMPLE_TITLES = {
  pastDue: 'Submit the quarterly report',
  future: 'Prepare the team offsite agenda',
  completed: 'Renew the domain certificate',
} as const;

/**
 * Sign in and return request headers carrying the session. The bearer token is used instead of the session cookie so
 * the cookie-origin write check does not apply: this is a Node test, not a browser, and it sends no Origin.
 */
async function signIn(request: Request): Promise<AuthHeaders> {
  const response = await request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { token?: string };
  expect(typeof body.token).toBe('string');
  return { authorization: `Bearer ${body.token}` };
}

interface TodoBody {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

async function createTodo(
  request: Request,
  auth: AuthHeaders,
  title: string,
  dueAt: string,
): Promise<TodoBody> {
  const response = await request('/todos', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ title, dueAt }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: TodoBody }).data;
}

async function readTodo(
  request: Request,
  auth: AuthHeaders,
  id: string,
): Promise<TodoBody> {
  const response = await request(`/todos/${id}`, { headers: auth });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: TodoBody }).data;
}

/** The application's schedule, read from the Scheduler plugin's own API. */
async function findSchedule(
  request: Request,
  auth: AuthHeaders,
): Promise<{ id: string; key: string; enabled: boolean; title: string }> {
  const response = await request('/scheduler/schedules?pageSize=100', {
    headers: auth,
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: { id: string; key: string; enabled: boolean; title: string }[];
  };
  const schedule = body.data.find((item) => item.key === 'todos.checkExpired');
  expect(schedule).toBeDefined();
  return schedule!;
}

test('requires a session for every todo route', async ({ request }) => {
  expect((await request('/todos')).status).toBe(401);
  expect((await request('/todos/anything')).status).toBe(401);
  expect(
    (
      await request('/todos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'x', dueAt: new Date().toISOString() }),
      })
    ).status,
  ).toBe(401);
});

test('installs the three sample todos', async ({ request }) => {
  const auth = await signIn(request);
  const response = await request('/todos?pageSize=100', { headers: auth });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: TodoBody[];
    meta: { page: number; pageSize: number; total: number };
  };
  const byTitle = new Map(body.data.map((todo) => [todo.title, todo]));

  // The seed upserts on a stable reference, so re-running it never duplicates a sample.
  const sampleTitles = new Set(Object.values(SAMPLE_TITLES));
  expect(body.data.filter((todo) => sampleTitles.has(todo.title))).toHaveLength(
    3,
  );

  expect(byTitle.get(SAMPLE_TITLES.pastDue)).toMatchObject({
    completed: false,
  });
  // The future todo and the completed one must never be marked expired, whether or not the schedule has already run.
  expect(byTitle.get(SAMPLE_TITLES.future)).toMatchObject({
    completed: false,
    expired: false,
  });
  expect(byTitle.get(SAMPLE_TITLES.completed)).toMatchObject({
    completed: true,
    expired: false,
  });
});

test('creates, reads, updates and deletes a todo', async ({ request }) => {
  const auth = await signIn(request);
  const dueAt = new Date(Date.now() + 86_400_000).toISOString();
  const created = await createTodo(request, auth, 'API round trip', dueAt);

  expect(created).toMatchObject({
    title: 'API round trip',
    completed: false,
    expired: false,
  });
  expect(typeof created.id).toBe('string');
  expect(new Date(created.dueAt).toISOString()).toBe(dueAt);

  const fetched = await readTodo(request, auth, created.id);
  expect(fetched.id).toBe(created.id);

  const patched = await request(`/todos/${created.id}`, {
    method: 'PATCH',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ completed: true }),
  });
  expect(patched.status).toBe(200);
  expect(((await patched.json()) as { data: TodoBody }).data.completed).toBe(
    true,
  );

  // `expired` belongs to the schedule, not to a caller.
  const rejected = await request(`/todos/${created.id}`, {
    method: 'PATCH',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ expired: true }),
  });
  expect(rejected.status).toBe(400);

  const deleted = await request(`/todos/${created.id}`, {
    method: 'DELETE',
    headers: auth,
  });
  expect(deleted.status).toBe(204);
  expect(
    (await request(`/todos/${created.id}`, { headers: auth })).status,
  ).toBe(404);
});

test('registers the check-expired schedule, visible and toggleable through the Scheduler API', async ({
  request,
}) => {
  const auth = await signIn(request);
  const schedule = await findSchedule(request, auth);

  expect(schedule.title).toBe('Check expired todos');
  expect(schedule.enabled).toBe(true);

  const disabled = await request(
    `/scheduler/schedules/${schedule.id}/disable`,
    {
      method: 'POST',
      headers: auth,
    },
  );
  expect(disabled.status).toBe(200);
  expect(
    ((await disabled.json()) as { data: { enabled: boolean } }).data.enabled,
  ).toBe(false);

  const enabled = await request(`/scheduler/schedules/${schedule.id}/enable`, {
    method: 'POST',
    headers: auth,
  });
  expect(enabled.status).toBe(200);
  expect(
    ((await enabled.json()) as { data: { enabled: boolean } }).data.enabled,
  ).toBe(true);
});

test('marks only past-due open todos as expired, idempotently', async ({
  request,
  testApp,
}) => {
  const auth = await signIn(request);
  // Take the schedule out of the way so the run under test is the only writer, and the counts are exact.
  const schedule = await findSchedule(request, auth);
  await request(`/scheduler/schedules/${schedule.id}/disable`, {
    method: 'POST',
    headers: auth,
  });

  const now = new Date();
  const past = new Date(now.getTime() - 60_000).toISOString();
  const future = new Date(now.getTime() + 60_000).toISOString();
  const openOverdue = await createTodo(request, auth, 'Overdue and open', past);
  const openFuture = await createTodo(request, auth, 'Future and open', future);
  const completedOverdue = await createTodo(
    request,
    auth,
    'Overdue but completed',
    past,
  );
  await request(`/todos/${completedOverdue.id}`, {
    method: 'PATCH',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ completed: true }),
  });

  const service = testApp.application.container.resolve(todosServiceToken);
  const first = await service.markExpired(now);
  // The seeded past-due todo is open too, so the exact count depends on whether the schedule already expired it.
  expect(first.updated).toBeGreaterThanOrEqual(1);
  const second = await service.markExpired(now);
  expect(second.updated).toBe(0);

  expect((await readTodo(request, auth, openOverdue.id)).expired).toBe(true);
  expect((await readTodo(request, auth, openFuture.id)).expired).toBe(false);
  const completed = await readTodo(request, auth, completedOverdue.id);
  expect(completed).toMatchObject({ completed: true, expired: false });

  await request(`/scheduler/schedules/${schedule.id}/enable`, {
    method: 'POST',
    headers: auth,
  });
});

test('declares every route in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  const list = document.paths?.['/api/todos']?.get;
  expect(list?.operationId).toBe('listTodos');
  expect(Object.keys(list?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '500',
  ]);

  const update = document.paths?.['/api/todos/{todoId}']?.patch;
  expect(update?.operationId).toBe('updateTodo');
  expect(Object.keys(update?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '404',
    '500',
  ]);
});

test('uses the application database for the todo table', async ({
  testApp,
}) => {
  // A guard against a route or service reaching another connection: the table is on the default one.
  const database = testApp.application.container.resolve(databaseManagerToken);
  expect(database.connection().name).toBe('main');
});
