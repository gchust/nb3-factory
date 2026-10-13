// @vitest-environment node
/**
 * The notification effects end to end, against the real database and the real notification service.
 *
 * This is the one place the lifecycle's `RepositoryLifecycleStore` is exercised, so it pins the contract between the
 * ticket lifecycle and the two log tables the migration declares: an effect's `transitionId` is written as a
 * number and read back with `String()`, so the column has to be numeric. A string column stored `3.0` and every
 * notification effect failed with `Filter value is invalid for Field "id" of type "integer"`.
 */
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';
import { buildServiceDeskSampleData } from '../../server/providers/sample-data.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    auth: { secret: 'service-desk-notification-test-secret' },
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

test('delivers the assignment and resolution notifications', async ({
  testApp,
}) => {
  const query = testApp.database.query();
  await buildServiceDeskSampleData(testApp.application.container);

  await waitFor(async () => {
    const runs = await query
      .selectFrom('lifecycleEffectRuns')
      .select('status')
      .execute();
    return runs.length >= 3 && runs.every((run) => run.status === 'succeeded');
  });

  const runs = await query
    .selectFrom('lifecycleEffectRuns')
    .select(['effect', 'status', 'attempts', 'error'])
    .execute();
  expect(runs.map((run) => run.effect).sort()).toEqual([
    'notifyAssignee',
    'notifyAssignee',
    'notifyRequester',
  ]);
  for (const run of runs) {
    expect(run).toMatchObject({ status: 'succeeded', error: null });
  }

  const users = await query
    .selectFrom('user')
    .select(['id', 'username'])
    .execute();
  const engineerId = users.find(
    (user) => user.username === 'demo.engineer',
  )?.id;
  const employeeId = users.find(
    (user) => user.username === 'demo.employee',
  )?.id;
  expect(engineerId).toBeTruthy();
  expect(employeeId).toBeTruthy();

  await waitFor(async () => {
    const delivered = await query
      .selectFrom('notificationInAppItems')
      .select('id')
      .execute();
    return delivered.length === 3;
  });

  const items = await query
    .selectFrom('notificationInAppItems')
    .select(['userId', 'title', 'target'])
    .execute();
  expect(items).toHaveLength(3);
  expect(items.filter((item) => item.userId === engineerId)).toHaveLength(2);
  expect(items.filter((item) => item.userId === employeeId)).toHaveLength(1);

  // Every notification carries a route back to the ticket it is about.
  for (const item of items) {
    expect(item.target).toMatchObject({
      type: 'route',
      path: expect.stringMatching(/^\/tickets\/\d+$/u),
    });
  }
});
