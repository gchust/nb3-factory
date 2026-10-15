// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { describe, expect } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';

/**
 * The real end-to-end check for the scheduled task: the application registers the schedule, the Scheduler plugin's own
 * executor fires it on its cron, the occurrence is recorded `succeeded`, and the firing — not the test — is what marks
 * the overdue todo expired. Nothing here reaches into the schedule to trigger it: the wait below is for the executor's
 * own timer, which is why the timeout has to cover a whole `* * * * *` period.
 */
const SCHEDULE_KEY = 'app.check-overdue-todos';
const FIRE_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 2_000;
/** A `* * * * *` schedule fires within a minute; the rest is the executor starting and the app installing. */
const TEST_TIMEOUT_MS = 120_000;

interface Schedule {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly targetType: string;
  readonly targetState: string;
  readonly lifecycleState: string;
  readonly runCount: number;
}

interface Occurrence {
  readonly id: string;
  readonly status: string;
  readonly resultSummary?: Record<string, unknown>;
}

interface TodoRow {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    // The standalone server is this test's own; its port is left to the OS and its database and storage are the
    // provisioned temporary ones.
    server: { host: '127.0.0.1', port: 0, startLog: false },
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      trustedOrigins: ['http://localhost'],
    },
  },
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  description: string,
  read: () => Promise<T | undefined>,
): Promise<T> {
  const deadline = Date.now() + FIRE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Timed out after ${FIRE_TIMEOUT_MS}ms waiting for ${description}.`,
  );
}

describe('app.check-overdue-todos', () => {
  test(
    'fires on its own cron, records a succeeded occurrence and expires only the overdue todo',
    { timeout: TEST_TIMEOUT_MS },
    async ({ testApp, database }) => {
      const session = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

      const schedulesResponse = await session.fetch(
        '/scheduler/schedules?page=1&pageSize=100',
      );
      expect(schedulesResponse.status).toBe(200);
      const { data: schedules } = (await schedulesResponse.json()) as {
        data: Schedule[];
      };
      const schedule = schedules.find((item) => item.key === SCHEDULE_KEY);
      expect(schedule).toMatchObject({
        cron: '* * * * *',
        timezone: 'UTC',
        enabled: true,
        targetType: SCHEDULE_KEY,
        targetState: 'ready',
        lifecycleState: 'active',
      });

      const succeeded = await waitFor('a succeeded occurrence', async () => {
        const response = await session.fetch(
          `/scheduler/schedules/${schedule!.id}/occurrences?pageSize=20`,
        );
        expect(response.status).toBe(200);
        const { data } = (await response.json()) as { data: Occurrence[] };
        return data.find((occurrence) => occurrence.status === 'succeeded');
      });
      // The firing dispatched the target this application registered, and the target's own result is what the
      // occurrence recorded. One todo was overdue, so one was marked.
      expect(succeeded.resultSummary).toMatchObject({ expiredCount: 1 });

      const todos = database.repository<TodoRow>('todos');
      const records = await todos.findMany({
        sort: (sort) => sort.field('dueAt').asc(),
      });
      expect(records).toHaveLength(3);
      const now = Date.now();
      for (const record of records) {
        const overdue = Date.parse(record.dueAt) < now && !record.completed;
        expect(record.expired).toBe(overdue);
      }
      expect(records.filter((record) => record.expired)).toHaveLength(1);

      // The firing is real: it counted the todos itself, and the schedule stopped at one expired row. That a second
      // firing changes nothing is covered without the wait by `todos-service.test.ts`, whose second `expireOverdue`
      // run updates 0 rows.
    },
  );
});
