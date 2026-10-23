// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';
import sampleDataSeed from '../../database/main/seeds/202611200002_ticket_sample_data.js';
import { ticketServiceToken } from '../../server/providers/ticket-service.js';

/*
 * The sample seed, against a fresh installation that asked for sample data.
 *
 * Sample seeds never run in production, so nothing else exercises them; this test is what proves the rows it inserts are
 * the shape the pages read, that they land in the overdue and workload figures, and that a second run adds nothing.
 */
const test = createAppTest({
  createServer: createStandaloneServer,
  scope: 'file',
  config: {
    app: { publicOrigin: 'http://localhost', sampleData: true },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    users: {
      initialAdmin: {
        username: 'nocobase',
        email: 'admin@nocobase.com',
        password: 'admin123',
      },
    },
  },
  server: { viteDevUrl: false },
});

test('the sample seed gives a fresh installation a dashboard worth looking at', async ({
  request,
  connection,
}) => {
  const rows = await connection.query
    .selectFrom('tickets')
    .selectAll()
    .execute();
  expect(rows).toHaveLength(5);
  // Re-running the seed adds nothing: an installation that already has tickets is left alone.
  await sampleDataSeed.run({ query: connection.query } as unknown as Parameters<
    typeof sampleDataSeed.run
  >[0]);
  const afterRerun = await connection.query
    .selectFrom('tickets')
    .select('id')
    .execute();
  expect(afterRerun).toHaveLength(5);
  // Every sample ticket is a starting point, so none of them carries a transition entry.
  const transitions = await connection.query
    .selectFrom('lifecycleTransitions')
    .select('id')
    .execute();
  expect(transitions).toHaveLength(0);
  // The comment log records the submission of every sample.
  const comments = await connection.query
    .selectFrom('ticketComments')
    .select('id')
    .execute();
  expect(comments).toHaveLength(6);

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

  const dashboard = await request('/tickets/dashboard', {
    headers: { cookie },
  });
  expect(dashboard.status).toBe(200);
  const body = (await dashboard.json()) as {
    data: {
      pendingAssignment: number;
      inProgress: number;
      waitingConfirmation: number;
      overdue: number;
      reportedByMe: number;
      assignedToMe: number;
      overdueHours: number;
      workload: { assigneeId: string; active: number; waiting: number }[];
      recent: { id: string }[];
    };
  };
  expect(body.data).toMatchObject({
    pendingAssignment: 2,
    inProgress: 1,
    waitingConfirmation: 1,
    overdue: 3,
    reportedByMe: 5,
    assignedToMe: 3,
    overdueHours: 24,
  });
  // The person who installed the application is the only engineer the samples were handed to.
  expect(body.data.workload).toHaveLength(1);
  expect(body.data.workload[0]).toMatchObject({ active: 2, waiting: 1 });
  expect(body.data.recent).toHaveLength(5);
});

test('reminds the service desk once about every ticket that has stayed unresolved', async ({
  app,
  request,
  connection,
}) => {
  const service = app.container.resolve(ticketServiceToken);
  // The scheduled sweep may already have reminded some of them, so the first call is allowed to find nothing left to
  // do; what matters is that every overdue ticket ends up stamped and a second call never repeats itself.
  await service.remindOverdue();
  expect(await service.remindOverdue()).toBe(0);
  const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const stamped = await connection.query
    .selectFrom('tickets')
    .select('id')
    .where('status', '!=', 'closed')
    .where('createdAt', '<=', threshold)
    .where('overdueNotifiedAt', 'is not', null)
    .execute();
  expect(stamped).toHaveLength(3);

  const signIn = await request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
  });
  const cookie = signIn.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');

  // The reminder reaches the service desk's inbox, and each message links to its ticket.
  let overdueMessages: { title: string; target: { path?: string } }[] = [];
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await request('/notificationInApp/messages', {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { title: string; target: { path?: string } }[];
    };
    overdueMessages = payload.data.filter((message) =>
      message.title.includes('overdue'),
    );
    if (overdueMessages.length >= 3) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(overdueMessages).toHaveLength(3);
  for (const message of overdueMessages) {
    expect(message.target.path).toMatch(/^\/tickets\//u);
  }
});
