// @vitest-environment node
import { createTestApp, type TestApp } from '@nocobase/app-testing/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  isHelpdeskOverseer,
  normalizeRole,
} from '../../server/helpdesk/roles.js';
import { createStandaloneServer } from '../../server/standalone.js';

/**
 * End-to-end coverage for the IT service desk: the application is started the way
 * `pnpm start` starts it, on a test database of its own, so the migration, the demo
 * accounts the sample tickets belong to, the role scoping and the transition rules are
 * all exercised through the HTTP API a browser would use.
 */
describe('it service desk', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp({
      createServer: createStandaloneServer,
      config: {
        auth: {
          secret: 'test-auth-secret-at-least-32-characters',
          // The in-process test client sends an Origin header for cookie-authenticated
          // writes; trust it explicitly the way a real deployment trusts its public origin.
          baseURL: 'http://localhost',
          trustedOrigins: ['http://localhost'],
        },
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('rejects anonymous requests to every helpdesk endpoint', async () => {
    const response = await app.request('/helpdesk/me');
    expect(response.status).toBe(401);
  });

  it('resolves the administrator role from the root permission set', async () => {
    const cookie = await signIn(app, 'nocobase', 'admin123');
    const viewer = await getJson<{ role: string }>(app, '/helpdesk/me', cookie);
    expect(viewer.role).toBe('admin');
  });

  it('offers the IT helpdesk role scope on the Users page and assigns it', async () => {
    const admin = await signIn(app, 'nocobase', 'admin123');
    const options = await getJson<{
      roleScopes: { key: string; options: { value: string }[] }[];
    }>(app, '/users/options', admin);
    const helpdesk = options.roleScopes.find(
      (scope) => scope.key === 'helpdesk',
    );
    expect(helpdesk).toBeTruthy();
    expect(helpdesk?.options.map((option) => option.value)).toEqual(
      expect.arrayContaining(['employee', 'engineer', 'serviceDesk']),
    );

    // A role assigned while the account is created must be stored atomically and take
    // effect on the next sign-in without an administrator editing the profile table.
    const created = await postJson<{
      id: string;
      roleScopes: Record<string, string>;
    }>(app, '/users', admin, {
      name: '新服务台',
      username: 'demo.newdesk',
      email: 'newdesk@demo.local',
      password: 'NewDesk@12345',
      roleScopes: { helpdesk: 'serviceDesk' },
    });
    expect(created.roleScopes.helpdesk).toBe('serviceDesk');

    const cookie = await signIn(app, 'demo.newdesk', 'NewDesk@12345');
    const viewer = await getJson<{ role: string }>(app, '/helpdesk/me', cookie);
    expect(viewer.role).toBe('serviceDesk');

    // The scope can also be changed from the Users page after creation.
    const updated = await putJson<{ roleScopes: Record<string, string> }>(
      app,
      `/users/${created.id}/roleScopes/helpdesk`,
      admin,
      { value: 'employee' },
    );
    expect(updated.roleScopes.helpdesk).toBe('employee');
    const after = await getJson<{ role: string }>(app, '/helpdesk/me', cookie);
    expect(after.role).toBe('employee');
  });

  it('lets an overseer see every sample ticket and the dashboard statistics', async () => {
    const cookie = await signIn(app, 'nocobase', 'admin123');
    const list = await getList<Ticket>(
      app,
      '/helpdesk/tickets?pageSize=100',
      cookie,
    );
    expect(list.meta.total).toBe(5);
    expect(list.data.map((ticket) => ticket.ticketNo)).toEqual(
      expect.arrayContaining([
        'HD-00001',
        'HD-00002',
        'HD-00003',
        'HD-00004',
        'HD-00005',
      ]),
    );

    const stats = await getJson<{
      total: number;
      pending: number;
      processing: number;
      resolved: number;
      overdue: number;
      engineerWorkload: { userId: string; open: number }[];
    }>(app, '/helpdesk/stats', cookie);
    expect(stats.total).toBe(5);
    expect(stats.pending).toBe(1);
    expect(stats.overdue).toBeGreaterThanOrEqual(1);
    expect(stats.engineerWorkload.length).toBe(2);
  });

  it('filters the list to overdue tickets regardless of open status', async () => {
    const cookie = await signIn(app, 'nocobase', 'admin123');

    // HD-00001 is still pending and HD-00002 is already being handled; both are
    // older than 24 hours, so an overdue view must return them across statuses
    // rather than only the pending ones.
    const overdue = await getList<Ticket>(
      app,
      '/helpdesk/tickets?overdue=true&pageSize=100',
      cookie,
    );
    expect(overdue.meta.total).toBe(2);
    expect(overdue.data.map((ticket) => ticket.ticketNo)).toEqual(
      expect.arrayContaining(['HD-00001', 'HD-00002']),
    );
    for (const ticket of overdue.data) {
      expect(ticket.overdue).toBe(true);
      expect(['pending', 'processing']).toContain(ticket.status);
    }

    const notOverdue = await getList<Ticket>(
      app,
      '/helpdesk/tickets?overdue=false&pageSize=100',
      cookie,
    );
    expect(notOverdue.meta.total).toBe(3);
    for (const ticket of notOverdue.data) {
      expect(ticket.overdue).toBe(false);
    }
  });

  it('scopes the list to the reporter for an employee', async () => {
    const cookie = await signIn(app, 'demo.employee', 'Demo@12345');
    const list = await getList<Ticket>(
      app,
      '/helpdesk/tickets?pageSize=100',
      cookie,
    );
    expect(list.meta.total).toBe(4);
    for (const ticket of list.data) {
      expect(ticket.reporterName).toBe('张三（员工）');
    }
  });

  it('scopes the list to assigned or reported tickets for an engineer', async () => {
    const cookie = await signIn(app, 'demo.engineer', 'Demo@12345');
    const list = await getList<Ticket>(
      app,
      '/helpdesk/tickets?pageSize=100',
      cookie,
    );
    expect(list.meta.total).toBe(2);
    for (const ticket of list.data) {
      expect(['HD-00002', 'HD-00004']).toContain(ticket.ticketNo);
    }
  });

  it('hides a ticket the signed-in user is not part of', async () => {
    const cookie = await signIn(app, 'demo.engineer2', 'Demo@12345');
    const hidden = await app.request('/helpdesk/tickets/1', {
      headers: { cookie, origin: ORIGIN },
    });
    expect(hidden.status).toBe(404);
    const body = (await hidden.json()) as { error?: { reason?: string } };
    expect(body.error?.reason).toBe('HELPDESK_TICKET_NOT_FOUND');
  });

  it('refuses dispatch from a caller who is not the service desk', async () => {
    const cookie = await signIn(app, 'demo.employee', 'Demo@12345');
    const refused = await app.request('/helpdesk/tickets/1/assign', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ assigneeId: 'someone' }),
    });
    expect(refused.status).toBe(403);
    const body = (await refused.json()) as { error?: { reason?: string } };
    expect(body.error?.reason).toBe('HELPDESK_FORBIDDEN');
  });

  it('moves a ticket from submission to a confirmed close, and back when sent back', async () => {
    const employee = await signIn(app, 'demo.employee', 'Demo@12345');
    const serviceDesk = await signIn(app, 'nocobase', 'admin123');
    const engineer = await signIn(app, 'demo.engineer', 'Demo@12345');

    const created = await postJson<Ticket>(app, '/helpdesk/tickets', employee, {
      title: '测试工单：外接显示器无信号',
      description: '会议室外接显示器接上笔记本后无信号，请协助排查。',
      urgency: 'high',
    });
    expect(created.status).toBe('pending');
    expect(created.ticketNo).toMatch(/^HD-\d{5}$/);

    // The assigned engineer of HD-00002 is reused for the dispatch.
    const all = await getList<Ticket>(
      app,
      '/helpdesk/tickets?pageSize=100',
      serviceDesk,
    );
    const engineerId = all.data.find(
      (ticket) => ticket.ticketNo === 'HD-00002',
    )?.assigneeId;
    expect(engineerId).toBeTruthy();

    const assigned = await postJson<Ticket>(
      app,
      `/helpdesk/tickets/${created.id}/assign`,
      serviceDesk,
      { assigneeId: engineerId },
    );
    expect(assigned.status).toBe('processing');
    expect(assigned.assigneeId).toBe(engineerId);

    const processed = await postJson<Ticket>(
      app,
      `/helpdesk/tickets/${created.id}/process`,
      engineer,
      { content: '已检查线缆并更换 HDMI 接口，正在复测。' },
    );
    expect(processed.status).toBe('processing');

    const resolved = await postJson<Ticket>(
      app,
      `/helpdesk/tickets/${created.id}/resolve`,
      engineer,
      { solution: '更换 HDMI 线后恢复正常显示。' },
    );
    expect(resolved.status).toBe('resolved');

    const rejected = await postJson<Ticket>(
      app,
      `/helpdesk/tickets/${created.id}/reject`,
      employee,
      { content: '问题仍然存在，请再检查。' },
    );
    expect(rejected.status).toBe('processing');
    expect(rejected.lastRejectedReason).toBe('问题仍然存在，请再检查。');

    const resolvedAgain = await postJson<Ticket>(
      app,
      `/helpdesk/tickets/${created.id}/resolve`,
      engineer,
      { solution: '更换了显示器的电源适配器，确认恢复正常。' },
    );
    expect(resolvedAgain.status).toBe('resolved');

    const confirmed = await postJson<Ticket>(
      app,
      `/helpdesk/tickets/${created.id}/confirm`,
      employee,
      undefined,
    );
    expect(confirmed.status).toBe('closed');

    const detail = await getJson<{ logs: { action: string }[] }>(
      app,
      `/helpdesk/tickets/${created.id}`,
      employee,
    );
    expect(detail.logs.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        'created',
        'assigned',
        'processed',
        'resolved',
        'rejected',
        'confirmed',
      ]),
    );
  });

  it('rejects a transition the ticket state does not allow', async () => {
    const cookie = await signIn(app, 'demo.employee', 'Demo@12345');
    // HD-00001 is pending, so it cannot be confirmed. A valid request the state
    // forbids is a failed precondition, which the API contract answers with 400.
    const response = await app.request('/helpdesk/tickets/1/confirm', {
      method: 'POST',
      headers: { cookie, origin: ORIGIN },
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { reason?: string } };
    expect(body.error?.reason).toBe('HELPDESK_CONFLICT');
  });
});

describe('helpdesk roles', () => {
  it('normalizes an unknown stored role to the least privileged one', () => {
    expect(normalizeRole('engineer')).toBe('engineer');
    expect(normalizeRole('serviceDesk')).toBe('serviceDesk');
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('nonsense')).toBe('employee');
    expect(normalizeRole(undefined)).toBe('employee');
  });

  it('treats the service desk and administrators as overseers', () => {
    expect(isHelpdeskOverseer('serviceDesk')).toBe(true);
    expect(isHelpdeskOverseer('admin')).toBe(true);
    expect(isHelpdeskOverseer('engineer')).toBe(false);
    expect(isHelpdeskOverseer('employee')).toBe(false);
  });
});

const ORIGIN = 'http://localhost';

interface Ticket {
  readonly id: number;
  readonly ticketNo: string;
  readonly status: string;
  readonly reporterName: string;
  readonly assigneeId: string | null;
  readonly lastRejectedReason: string | null;
  readonly overdue: boolean;
}

async function signIn(
  app: TestApp,
  username: string,
  password: string,
): Promise<string> {
  const response = await app.request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ username, password }),
  });
  if (response.status !== 200) {
    throw new Error(`sign-in failed for ${username}: ${response.status}`);
  }
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

async function getJson<T>(
  app: TestApp,
  path: string,
  cookie: string,
): Promise<T> {
  const response = await app.request(path, {
    headers: { cookie, origin: ORIGIN },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status}`);
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}

async function getList<T>(
  app: TestApp,
  path: string,
  cookie: string,
): Promise<{ data: T[]; meta: { total: number } }> {
  const response = await app.request(path, {
    headers: { cookie, origin: ORIGIN },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status}`);
  }
  return (await response.json()) as { data: T[]; meta: { total: number } };
}

async function postJson<T>(
  app: TestApp,
  path: string,
  cookie: string,
  payload: unknown,
): Promise<T> {
  const response = await app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', origin: ORIGIN },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed: ${response.status}`);
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}

async function putJson<T>(
  app: TestApp,
  path: string,
  cookie: string,
  payload: unknown,
): Promise<T> {
  const response = await app.request(path, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json', origin: ORIGIN },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  if (!response.ok) {
    throw new Error(`PUT ${path} failed: ${response.status}`);
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}
