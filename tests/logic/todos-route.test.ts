// @vitest-environment node
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: { secrets: { keys: [{ version: 1, key: 'a'.repeat(64) }] } },
});

test('serves the seeded todos to a signed-in user only', async ({
  request,
  testApp,
}) => {
  expect((await request('/todos')).status).toBe(401);

  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/todos');

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: [
      {
        id: 'todo-overdue-incomplete',
        title: 'Prepare the production schedule',
        dueAt: '2020-01-01T08:00:00.000Z',
        completed: false,
        expired: false,
      },
      {
        id: 'todo-overdue-completed',
        title: 'Confirm the raw material stock',
        dueAt: '2020-02-01T08:00:00.000Z',
        completed: true,
        expired: false,
      },
      {
        id: 'todo-future',
        title: 'Inspect the new assembly line',
        dueAt: '2099-01-01T08:00:00.000Z',
        completed: false,
        expired: false,
      },
    ],
    meta: { total: 3 },
  });

  const schedules = await admin.fetch('/scheduler/schedules?pageSize=100');
  expect(schedules.status).toBe(200);
  expect(await schedules.json()).toMatchObject({
    data: [
      {
        key: 'app.check-overdue-todos',
        title: 'Check overdue todos',
        cron: '*/30 * * * * *',
        timezone: 'UTC',
        enabled: true,
        targetType: 'app.check-overdue-todos',
        targetState: 'ready',
        targetSummary: { targetLabel: 'Check overdue todos' },
      },
    ],
  });
});
