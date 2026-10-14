// @vitest-environment node
import { createAppTest, type TestApp } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    secrets: {
      keys: [{ version: 1, key: 'test-secrets-key-0123456789abcdef0123' }],
    },
    auth: {
      emailAndPassword: { enabled: true },
      session: { storeSessionInDatabase: true },
    },
    users: {
      initialAdmin: {
        username: 'nocobase',
        email: 'admin@nocobase.com',
        password: 'admin123',
      },
    },
  },
  scope: 'file',
});

type Request = TestApp['request'];

async function signIn(request: Request): Promise<Record<string, string>> {
  const response = await request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
  });
  const body = (await response.json()) as { token?: string };
  return { authorization: `Bearer ${body.token}` };
}

test('a real scheduler run marks the overdue todo expired and records an occurrence', async ({
  request,
}) => {
  const auth = await signIn(request);

  // The seeded past-due todo is the subject. The schedule is enabled by default.
  const listResponse = await request('/todos?pageSize=100', { headers: auth });
  const list = (await listResponse.json()) as {
    data: { id: string; title: string; expired: boolean }[];
  };
  const overdue = list.data.find(
    (todo) => todo.title === 'Submit the quarterly report',
  );
  expect(overdue).toBeDefined();

  const deadline = Date.now() + 90_000;
  let expired = overdue!.expired;
  while (!expired && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const current = await request(`/todos/${overdue!.id}`, { headers: auth });
    expired = ((await current.json()) as { data: { expired: boolean } }).data
      .expired;
  }
  expect(expired).toBe(true);

  const schedules = await request('/scheduler/schedules?pageSize=100', {
    headers: auth,
  });
  const scheduleBody = (await schedules.json()) as {
    data: { id: string; key: string }[];
  };
  const schedule = scheduleBody.data.find(
    (item) => item.key === 'todos.checkExpired',
  )!;
  const occurrences = await request(
    `/scheduler/schedules/${schedule.id}/occurrences?pageSize=10`,
    { headers: auth },
  );
  const occurrenceBody = (await occurrences.json()) as {
    data: { status: string; resultSummary?: unknown }[];
  };
  expect(occurrenceBody.data.some((item) => item.status === 'succeeded')).toBe(
    true,
  );

  // The completed and future todos were not touched.
  const final = (await (
    await request('/todos?pageSize=100', { headers: auth })
  ).json()) as {
    data: { title: string; expired: boolean; completed: boolean }[];
  };
  const future = final.data.find(
    (todo) => todo.title === 'Prepare the team offsite agenda',
  );
  const completed = final.data.find(
    (todo) => todo.title === 'Renew the domain certificate',
  );
  expect(future).toMatchObject({ expired: false });
  expect(completed).toMatchObject({ completed: true, expired: false });
}, 120_000);
