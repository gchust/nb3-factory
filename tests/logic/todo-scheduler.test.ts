// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import { expect, vi } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';
import type { TodoRecord } from '../../server/providers/todos.js';

/**
 * The application as `pnpm start` runs it, on a database of its own, with the required todo seed loaded so the
 * schedule has something real to mark. A short cron makes the verification run finish inside the test.
 */
const test = createAppTest({
  createServer: createStandaloneServer,
  scope: 'file',
  config: {
    // No `app.sampleData`: the three todos are required data, so they must load without it.
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

const PASSWORD = 'member-password-123';

async function signIn(
  request: (path: string, init?: RequestInit) => Promise<Response>,
  username: string,
  password: string,
): Promise<string> {
  const response = await request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

test('rejects an anonymous request before any todo is read', async ({
  request,
}) => {
  const response = await request('/todos');
  expect(response.status).toBe(401);
});

test('serves the todo list to an administrator', async ({ request }) => {
  const cookie = await signIn(request, 'nocobase', 'admin123');
  const response = await request('/todos', { headers: { cookie } });

  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: TodoRecord[] };
  expect(body.data.map((row) => row.title).sort()).toEqual(
    ['已过期待办', '已完成待办', '未来待办'].sort(),
  );
  expect(body.data.every((row) => typeof row.expired === 'boolean')).toBe(true);
});

test('denies a signed-in user without the page grant', async ({ request }) => {
  const signUp = await request('/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'member@example.com',
      password: PASSWORD,
      name: 'Member',
      username: 'member1',
    }),
  });
  expect([200, 201]).toContain(signUp.status);

  const cookie = await signIn(request, 'member1', PASSWORD);
  const response = await request('/todos', { headers: { cookie } });

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    error: { reason: 'TODO_ACCESS_REQUIRED', domain: 'todos' },
  });
});

test('registers the expiry schedule in the Scheduler', async ({ request }) => {
  const cookie = await signIn(request, 'nocobase', 'admin123');
  const response = await request('/scheduler/schedules', {
    headers: { cookie },
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: Array<Record<string, unknown>>;
  };
  const schedule = body.data.find((item) => item.key === 'todos.check-expired');
  expect(schedule).toMatchObject({
    title: '检查过期待办',
    enabled: true,
    targetType: 'app.checkExpiredTodos',
    targetState: 'ready',
  });
});

test(
  'a real firing marks the overdue, unfinished todo and leaves the others',
  { timeout: 60_000 },
  async ({ request, database }) => {
    const cookie = await signIn(request, 'nocobase', 'admin123');
    const repository = database.repository<TodoRecord>('todos');

    // The schedule's cron fires every ten seconds; wait for the run that has the required todos to sweep.
    await vi.waitFor(
      async () => {
        const overdue = await repository.findOne({
          filter: { title: '已过期待办' },
        });
        expect(overdue?.expired).toBe(true);
      },
      { timeout: 45_000, interval: 1_000 },
    );

    const rows = await repository.findMany({
      sort: (sort) => [sort.field('id').asc()],
    });
    const byTitle = new Map(rows.map((row) => [row.title, row]));
    expect(byTitle.get('未来待办')?.expired).toBe(false);
    expect(byTitle.get('已完成待办')?.expired).toBe(false);
    // A repeated sweep never adds a record.
    expect(rows.filter((row) => row.title === '已过期待办')).toHaveLength(1);

    const schedules = (await (
      await request('/scheduler/schedules', { headers: { cookie } })
    ).json()) as { data: Array<Record<string, unknown>> };
    const schedule = schedules.data.find(
      (item) => item.key === 'todos.check-expired',
    );
    expect(schedule).toBeDefined();

    const occurrences = (await (
      await request(
        `/scheduler/schedules/${String(schedule?.id)}/occurrences`,
        {
          headers: { cookie },
        },
      )
    ).json()) as {
      data: Array<{
        status: string;
        resultSummary?: Record<string, unknown>;
      }>;
    };
    const succeeded = occurrences.data.find(
      (occurrence) =>
        occurrence.status === 'succeeded' &&
        typeof occurrence.resultSummary?.updatedCount === 'number',
    );
    expect(succeeded).toBeDefined();
    expect(succeeded?.resultSummary?.updatedCount).toBeGreaterThanOrEqual(1);
  },
);
