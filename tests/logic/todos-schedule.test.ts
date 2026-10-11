// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';
import { CHECK_OVERDUE_TODOS_SCHEDULE_KEY } from '../../server/providers/todos.js';

// One real scheduling run, through the application's own runtime and the Scheduler plugin: no route writes the
// `expired` flag, and there is no "run now" shortcut, so this waits for the schedule's own next firing.
const test = createAppTest({
  createServer: createStandaloneServer,
  scope: 'file',
  config: { auth: { secret: 'test-auth-secret-at-least-32-characters' } },
});

interface Occurrence {
  readonly id: string;
  readonly status: string;
  readonly resultSummary?: { readonly marked?: unknown };
}

test(
  'the schedule fires, marks the overdue todo, and records the result',
  { timeout: 120_000 },
  async ({ request }) => {
    const signIn = await request('/auth/sign-in/username', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
    });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers
      .getSetCookie()
      .map((header) => header.split(';')[0])
      .join('; ');

    const schedules = await request('/scheduler/schedules?pageSize=50', {
      headers: { cookie },
    });
    expect(schedules.status).toBe(200);
    const schedule = (
      (await schedules.json()) as {
        data: {
          id: string;
          key: string;
          title: string;
          cron: string;
          timezone: string;
          enabled: boolean;
          lifecycleState: string;
          targetState: string;
          runCount: number;
          completedCount: number;
        }[];
      }
    ).data.find((item) => item.key === CHECK_OVERDUE_TODOS_SCHEDULE_KEY);
    expect(schedule).toBeDefined();
    // The shape the `/schedules` page renders: without these the page would show blanks even though the job runs.
    expect(schedule).toMatchObject({
      title: '检查过期待办',
      cron: '*/30 * * * * *',
      timezone: 'Asia/Shanghai',
      enabled: true,
      lifecycleState: 'active',
      targetState: 'ready',
    });
    expect(typeof schedule!.runCount).toBe('number');
    expect(typeof schedule!.completedCount).toBe('number');

    // The cron fires every 30 seconds; poll for the first completed occurrence rather than assuming a timing.
    let occurrence: Occurrence | undefined;
    for (let attempt = 0; attempt < 45 && !occurrence; attempt += 1) {
      const response = await request(
        `/scheduler/schedules/${schedule!.id}/occurrences?pageSize=20`,
        { headers: { cookie } },
      );
      expect(response.status).toBe(200);
      const { data } = (await response.json()) as { data: Occurrence[] };
      occurrence = data.find(
        (item) =>
          item.status === 'succeeded' &&
          typeof item.resultSummary?.marked === 'number',
      );
      if (!occurrence) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    expect(occurrence).toBeDefined();
    // The first real firing finds the seeded overdue todo.
    expect(occurrence!.resultSummary?.marked).toBeGreaterThanOrEqual(1);

    const todos = await request('/todos', { headers: { cookie } });
    const { data } = (await todos.json()) as {
      data: { completed: boolean; expired: boolean }[];
    };
    const expired = data.filter((row) => row.expired);
    expect(expired).toHaveLength(1);
    // The schedule marks only overdue, unfinished todos; the completed one stays untouched.
    expect(expired[0]!.completed).toBe(false);
    expect(data.filter((row) => row.completed)).toHaveLength(1);
    expect(data.find((row) => row.completed)!.expired).toBe(false);
  },
);
