// @vitest-environment node
/**
 * The sample data a fresh installation of this application shows: a small, examinable service desk rather than an
 * empty one. It is built through the real services — including the Users service, so the demo accounts can sign in —
 * and it backdates one open ticket so the "open over 24 hours" reminder has something to fire on. This pins both the
 * content and the idempotency: running it again must not duplicate a person or a ticket.
 */
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';
import {
  buildServiceDeskSampleData,
  ensureOverdueDemoTicket,
} from '../../server/providers/sample-data.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    auth: { secret: 'service-desk-sample-data-test-secret' },
  },
});

/** Polls `check` until it answers true, so the test does not race the job executor. */
async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the lifecycle effects to settle.');
}

test('ships a small, examinable service desk on a fresh install', async ({
  testApp,
}) => {
  const query = testApp.database.query();
  const container = testApp.application.container;

  await buildServiceDeskSampleData(container);
  await ensureOverdueDemoTicket(container);

  const users = await query
    .selectFrom('user')
    .select(['id', 'username'])
    .execute();
  const engineer = users.find((user) => user.username === 'demo.engineer');
  const employee = users.find((user) => user.username === 'demo.employee');
  expect(engineer).toBeTruthy();
  expect(employee).toBeTruthy();

  const staff = await query
    .selectFrom('serviceDeskStaff')
    .select(['userId', 'role'])
    .execute();
  expect(staff.find((member) => member.userId === engineer?.id)?.role).toBe(
    'engineer',
  );

  // Three tickets, each left at a different stage of the lifecycle.
  const tickets = await query
    .selectFrom('tickets')
    .select(['id', 'title', 'status'])
    .execute();
  expect(tickets).toHaveLength(3);
  expect(tickets.map((ticket) => ticket.status).sort()).toEqual([
    'processing',
    'resolved',
    'submitted',
  ]);
  const printer = tickets.find((ticket) => /printer/iu.test(ticket.title));
  expect(printer).toBeTruthy();

  // The homepage count the desk sees: one already past 24 hours, and work still waiting.
  const session = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const overview = await session.fetch('/serviceDesk/overview');
  expect(overview.status).toBe(200);
  const { data } = (await overview.json()) as {
    data: { overdue: number; open: number; pendingAssignment: number };
  };
  expect(data.overdue).toBeGreaterThanOrEqual(1);
  expect(data.open).toBeGreaterThanOrEqual(2);
  expect(data.pendingAssignment).toBeGreaterThanOrEqual(1);

  // The desk was reminded about the overdue ticket, in its own inbox.
  await waitFor(async () => {
    const runs = await query
      .selectFrom('lifecycleEffectRuns')
      .select(['effect', 'status'])
      .execute();
    return runs.some(
      (run) => run.effect === 'notifyHelpdesk' && run.status === 'succeeded',
    );
  });
  await waitFor(async () => {
    const items = await query
      .selectFrom('notificationInAppItems')
      .select(['userId', 'title'])
      .execute();
    return items.some(
      (item) =>
        typeof item.title === 'string' && item.title.includes('over 24 hours'),
    );
  });

  // Running it again changes nothing: the people and the tickets are found, not recreated.
  await buildServiceDeskSampleData(container);
  await ensureOverdueDemoTicket(container);
  const after = await query.selectFrom('tickets').select(['id']).execute();
  expect(after).toHaveLength(3);
  const demoUsers = await query
    .selectFrom('user')
    .select(['id'])
    .where('username', 'like', 'demo.%')
    .execute();
  expect(demoUsers).toHaveLength(2);
});
