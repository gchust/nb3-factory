// @vitest-environment node
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import type { TodoRecord } from '../../server/providers/todos.js';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  // The application has no default for its master keys — config.yml normally supplies them — so the test does.
  server: { env: { SECRETS_KEYS: `1:${'a'.repeat(64)}` } },
});

const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2099-12-31T00:00:00.000Z');

test('lists todos to a signed-in caller and refuses an anonymous one', async ({
  testApp,
  request,
}) => {
  expect((await request('/todos')).status).toBe(401);

  const todos = testApp.database.repository<TodoRecord>('todos');
  await todos.createMany({
    values: [
      { title: 'past', dueAt: PAST, completed: false, overdue: false },
      { title: 'future', dueAt: FUTURE, completed: false, overdue: false },
    ],
  });

  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/todos?pageSize=100');
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    readonly data: readonly { readonly title: string }[];
    readonly meta: { readonly total: number };
  };
  expect(body.data.map((todo) => todo.title)).toEqual(
    expect.arrayContaining(['future', 'past']),
  );
  // The seeded walkthrough rows are there too, so the total is what the query returned.
  expect(body.meta.total).toBe(body.data.length);
});

test('keeps the schedule registered with a ready target', async ({
  testApp,
}) => {
  const scheduler = testApp.application.container.resolve(
    schedulerServiceToken,
  );
  const plans = await scheduler.list();
  const plan = plans.find((item) => item.title === '检查过期待办');

  expect(plan).toBeDefined();
  // The plan is enabled when the application starts and points at a target this application supplied.
  expect(plan?.enabled).toBe(true);
  expect(plan?.targetState).toBe('ready');
  expect(plan?.cron).toBe('* * * * *');
});

test('serves the schedule to the management page only after sign-in', async ({
  testApp,
  request,
}) => {
  expect((await request('/scheduler/schedules')).status).toBe(401);

  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/scheduler/schedules?pageSize=100');
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    readonly data: readonly { readonly title: string }[];
  };
  expect(body.data.some((item) => item.title === '检查过期待办')).toBe(true);
});

test('declares every route in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);
  const list = document.paths?.['/api/todos']?.get;
  expect(list?.operationId).toBe('todosListTodos');
  // 401 and 500 are listed by the route; the query validator adds the 400.
  expect(Object.keys(list?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '500',
  ]);
});
