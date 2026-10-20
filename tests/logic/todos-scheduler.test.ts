// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';
import {
  TODO_EXPIRY_SCHEDULE_KEY,
  TODO_EXPIRY_TARGET,
} from '../../server/providers/todos-scheduler.js';
import {
  todoServiceToken,
  type TodoRow,
} from '../../server/providers/todos.js';

interface TodoListResponse {
  readonly data: readonly {
    readonly id: string;
    readonly title: string;
    readonly dueAt: string;
    readonly completed: boolean;
    readonly expired: boolean;
  }[];
  readonly meta: { readonly total: number };
}

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const test = createAppTest({
  createServer: createStandaloneServer,
  scope: 'file',
});

test('the todo API is protected and the expiry check is idempotent', async ({
  testApp,
}) => {
  // The route owns its security; mounting it under /api authenticates nothing.
  expect((await testApp.request('/todos')).status).toBe(401);

  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/todos?page=1&pageSize=100');
  expect(response.status).toBe(200);
  const body = (await response.json()) as TodoListResponse;
  expect(body.meta.total).toBe(3);
  expect(body.data.map((todo) => todo.id).sort()).toEqual([
    'todo-completed-sample',
    'todo-future-sample',
    'todo-overdue-sample',
  ]);
  expect(body.data.every((todo) => todo.dueAt.endsWith('Z'))).toBe(true);

  // The provider registered both the target and the every-30-seconds schedule.
  const scheduler = testApp.application.container.resolve(
    schedulerServiceToken,
  );
  const schedule = (await scheduler.list()).find(
    (item) => item.key === TODO_EXPIRY_SCHEDULE_KEY,
  );
  expect(schedule).toMatchObject({
    enabled: true,
    targetType: TODO_EXPIRY_TARGET,
    targetState: 'ready',
    cron: '*/30 * * * * *',
  });

  const service = testApp.application.container.resolve(todoServiceToken);
  // The scheduler may already have fired during startup, so the first call's
  // `marked` count is not asserted. The second call must change nothing.
  await service.markExpired();
  const second = await service.markExpired();
  expect(second).toMatchObject({ marked: 0, total: 3 });

  const todos = testApp.database.repository<TodoRow>('todos');
  const rows = await todos.findMany();
  expect(rows).toHaveLength(3);
  const byId = new Map(rows.map((row) => [row.id, row]));
  expect(byId.get('todo-overdue-sample')?.expired).toBe(true);
  // A future due time and a completed past-due todo are both left alone.
  expect(byId.get('todo-future-sample')?.expired).toBe(false);
  expect(byId.get('todo-completed-sample')?.expired).toBe(false);

  const after = (await (
    await admin.fetch('/todos?page=1&pageSize=100')
  ).json()) as TodoListResponse;
  expect(after.meta.total).toBe(3);
  expect(
    after.data.find((todo) => todo.id === 'todo-overdue-sample')?.expired,
  ).toBe(true);

  // A signed-in person without a `todos` grant does not reach the records.
  const role = await admin.fetch('/authorization/permissionSets', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({
      key: 'no-todo-grants',
      title: 'No todo grants',
      grants: [],
    }),
  });
  expect(role.status).toBe(201);
  const created = await admin.fetch('/users', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({
      name: 'No Todo Grants',
      email: 'no-todo-grants@example.com',
      password: 'MemberPass123',
      roleScopes: { app: ['no-todo-grants'] },
    }),
  });
  expect(created.status).toBe(201);
  const member = await signIn(testApp, {
    email: 'no-todo-grants@example.com',
    password: 'MemberPass123',
  });
  const denied = await member.fetch('/todos');
  expect(denied.status).toBe(403);
  expect(await denied.json()).toMatchObject({
    error: { reason: 'TODOS_READ_DENIED' },
  });
});
