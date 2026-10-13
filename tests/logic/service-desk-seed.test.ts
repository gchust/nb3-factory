// @vitest-environment node
/**
 * The required seed that puts the first account on the service desk: it runs on install, it is idempotent, and it
 * restores the appointment after the mapping is cleared.
 */
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest, type TestApp } from '@nocobase/app-testing/server';
import type { SeedContext } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import seed from '../../database/main/seeds/202611010001_service_desk_initial_helpdesk.js';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    auth: { secret: 'service-desk-seed-test-secret-at-least-32' },
  },
});

/** The seed's own inputs, rebuilt from the started application. */
function seedContext(app: TestApp): SeedContext {
  return {
    config: {} as SeedContext['config'],
    container: app.application.container,
    repository: (collection) => app.database.repository(collection),
    query: app.database.query(),
    connection: app.connection,
  };
}

test('appoints the first account on install, and only once', async ({
  testApp,
}) => {
  const query = testApp.database.query();
  const staff = await query
    .selectFrom('serviceDeskStaff')
    .select(['userId', 'role'])
    .execute();
  expect(staff).toHaveLength(1);
  expect(staff[0]).toMatchObject({ role: 'helpdesk' });

  // The administrator is the first account, so the seed appoints them.
  const session = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  expect(String(staff[0].userId)).toBe(String(session.user.id));

  // A second run with the row in place changes nothing.
  await seed.run(seedContext(testApp));
  const again = await query
    .selectFrom('serviceDeskStaff')
    .select('id')
    .execute();
  expect(again).toHaveLength(1);
});

test('restores the appointment after the mapping is cleared', async ({
  testApp,
}) => {
  const query = testApp.database.query();
  await query.deleteFrom('serviceDeskStaff').allowAllRows().execute();
  expect(
    await query.selectFrom('serviceDeskStaff').select('id').execute(),
  ).toHaveLength(0);

  await seed.run(seedContext(testApp));

  const staff = await query
    .selectFrom('serviceDeskStaff')
    .select(['userId', 'role'])
    .execute();
  expect(staff).toHaveLength(1);
  expect(staff[0]).toMatchObject({ role: 'helpdesk' });
});

describe('the initial service desk appointment', () => {
  it('is required data rather than sample data', () => {
    expect(seed.sample).toBeUndefined();
  });
});
