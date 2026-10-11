// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

// The whole application on a database of its own: the real route stack, the real authentication and the real page
// permission check, so these assertions are about what a caller gets rather than about the handler in isolation.
const test = createAppTest({
  createServer: createStandaloneServer,
  scope: 'file',
  config: {
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      // The application's own origin, so the request this test builds for a cookie write is accepted.
      trustedOrigins: ['http://localhost'],
    },
  },
});

type Request = (path: string, init?: RequestInit) => Promise<Response>;

async function signIn(
  request: Request,
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

test('rejects an anonymous request', async ({ request }) => {
  const response = await request('/todos');
  expect(response.status).toBe(401);
});

test('lists the seeded todos for an administrator and toggles one', async ({
  request,
}) => {
  const cookie = await signIn(request, 'nocobase', 'admin123');

  const list = await request('/todos', { headers: { cookie } });
  expect(list.status).toBe(200);
  const body = (await list.json()) as {
    data: { id: number; title: string; completed: boolean; expired: boolean }[];
  };
  expect(body.data).toHaveLength(3);

  const target = body.data[0]!;
  const patched = await request(`/todos/${target.id}`, {
    method: 'PATCH',
    headers: {
      cookie,
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({ completed: !target.completed }),
  });
  expect(patched.status).toBe(200);
  await expect(patched.json()).resolves.toMatchObject({
    data: { id: target.id, completed: !target.completed },
  });

  const reread = await request('/todos', { headers: { cookie } });
  const updated = (await reread.json()) as {
    data: { id: number; completed: boolean }[];
  };
  expect(updated.data.find((row) => row.id === target.id)?.completed).toBe(
    !target.completed,
  );
});

test('answers a missing todo with a 404', async ({ request }) => {
  const cookie = await signIn(request, 'nocobase', 'admin123');
  const response = await request('/todos/999999', {
    method: 'PATCH',
    headers: {
      cookie,
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({ completed: true }),
  });
  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toMatchObject({
    error: { reason: 'TODO_NOT_FOUND' },
  });
});

test('refuses a signed-in user without the page permission', async ({
  request,
}) => {
  const signUp = await request('/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Todo Reader',
      username: 'todo_reader',
      email: 'todo_reader@example.com',
      password: 'reader-password-123',
    }),
  });
  expect(signUp.status).toBe(200);

  const cookie = await signIn(request, 'todo_reader', 'reader-password-123');
  const response = await request('/todos', { headers: { cookie } });
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    error: { reason: 'TODO_ACCESS_REQUIRED' },
  });
});
