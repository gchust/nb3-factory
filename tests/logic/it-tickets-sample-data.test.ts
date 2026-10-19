// @vitest-environment node
import { createTestApp, type TestApp } from '@nocobase/app-testing/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp({
    createServer: createStandaloneServer,
    config: { app: { sampleData: true } },
  });
}, 300_000);

afterAll(async () => {
  await app?.close();
});

describe('IT service desk sample data', () => {
  it('loads demo tickets, including one already overdue', async () => {
    const tickets = await app.database
      .query()
      .selectFrom('itTickets')
      .select(['title', 'status', 'createdAt', 'assigneeId'])
      .execute();

    const titles = tickets.map((ticket) => ticket.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        '[Demo] 办公室打印机无法连接 / Office printer offline',
        '[Demo] 新同事电脑无法登录 / New colleague cannot sign in',
        '[Demo] 显示器闪烁 / Monitor flickering',
        '[Demo] 申请安装设计软件 / Design software install',
      ]),
    );

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const overdue = tickets.filter(
      (ticket) =>
        (ticket.status === 'pending' || ticket.status === 'in_progress') &&
        new Date(ticket.createdAt).getTime() < cutoff,
    );
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toEqual(
      expect.objectContaining({
        status: 'in_progress',
        title: '[Demo] 新同事电脑无法登录 / New colleague cannot sign in',
      }),
    );
    expect(overdue[0]?.assigneeId).toBeTruthy();
  });

  it('lets the service desk load the demo data again and refuses an engineer', async () => {
    const before = await app.database
      .query()
      .selectFrom('itTickets')
      .select('id')
      .execute();

    const serviceKey = await signInApiKey('itdemo_service', 'Demo123456!');
    const serviceRequest = (path: string, init: RequestInit = {}) =>
      app.request(path, {
        ...init,
        headers: { 'x-api-key': serviceKey, ...init.headers },
      });

    const reload = await serviceRequest('/tickets/sample-data', {
      method: 'POST',
    });
    expect(reload.status).toBe(200);
    expect(await reload.json()).toEqual({
      data: { loaded: true, overdueReminded: expect.any(Number) },
    });

    const after = await app.database
      .query()
      .selectFrom('itTickets')
      .select('id')
      .execute();
    expect(after).toHaveLength(before.length);

    const roster = await serviceRequest('/tickets/engineers');
    expect(roster.status).toBe(200);
    const engineers = (await roster.json()) as {
      data: { username?: string; email: string }[];
    };
    expect(engineers.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: 'engineer1@it-demo.example.com' }),
        expect.objectContaining({ email: 'engineer2@it-demo.example.com' }),
      ]),
    );

    const engineerKey = await signInApiKey('itdemo_engineer1', 'Demo123456!');
    const denied = await app.request('/tickets/sample-data', {
      method: 'POST',
      headers: { 'x-api-key': engineerKey },
    });
    expect(denied.status).toBe(403);
  });

  it('assigns the demo people the permission sets their roles need', async () => {
    const assignments = await app.database
      .query()
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['subjectType', 'permissionSetKey'])
      .where('subjectType', '=', 'user')
      .where('permissionSetKey', 'in', ['it-service-desk', 'it-engineer'])
      .execute();

    expect(
      assignments.filter(
        (assignment) => assignment.permissionSetKey === 'it-service-desk',
      ),
    ).not.toHaveLength(0);
    expect(
      assignments.filter(
        (assignment) => assignment.permissionSetKey === 'it-engineer',
      ),
    ).toHaveLength(2);
  });

  it('lets the service desk manage accounts and keeps engineers out', async () => {
    const serviceKey = await signInApiKey('itdemo_service', 'Demo123456!');
    const list = await app.request('/users?page=1&pageSize=100', {
      headers: { 'x-api-key': serviceKey },
    });
    expect(list.status).toBe(200);

    const created = await app.request('/users', {
      method: 'POST',
      headers: {
        'x-api-key': serviceKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'New Engineer',
        email: 'new.engineer@example.com',
        password: 'Demo123456!',
        roleScopes: { app: ['it-engineer'] },
      }),
    });
    expect(created.status).toBe(201);
    const createdUser = (await created.json()) as {
      data: { id: string; roleScopes: { app: string[] } };
    };
    expect(createdUser.data).toEqual(
      expect.objectContaining({
        email: 'new.engineer@example.com',
        roleScopes: expect.objectContaining({ app: ['it-engineer'] }),
      }),
    );

    const promoted = await app.request(
      `/users/${createdUser.data.id}/roleScopes/app`,
      {
        method: 'PUT',
        headers: {
          'x-api-key': serviceKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ value: ['it-engineer', 'it-service-desk'] }),
      },
    );
    expect(promoted.status).toBe(200);
    expect((await promoted.json()).data.roleScopes.app).toEqual(
      expect.arrayContaining(['it-engineer', 'it-service-desk']),
    );

    const engineerKey = await signInApiKey('itdemo_engineer1', 'Demo123456!');
    const denied = await app.request('/users', {
      headers: { 'x-api-key': engineerKey },
    });
    expect(denied.status).toBe(403);
  });
});

async function signInApiKey(
  username: string,
  password: string,
): Promise<string> {
  const signIn = await app.request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (signIn.status !== 200) {
    throw new Error(`Sign-in failed with ${signIn.status}`);
  }
  const cookie = signIn.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  const created = await app.request('/auth/api-key/create', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `sample-${username}` }),
  });
  if (created.status !== 200) {
    throw new Error(`API key creation failed with ${created.status}`);
  }
  return ((await created.json()) as { key: string }).key;
}
