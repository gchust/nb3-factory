// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

/*
 * The ticket API, against the application a user has: its own standalone server, on its own database, with every
 * migration and seed applied. These tests are what proves the endpoints' authentication and authorization, and that
 * the lifecycle the routes drive is the one the declaration describes.
 */
const test = createAppTest({
  createServer: createStandaloneServer,
  scope: 'file',
  config: {
    app: { publicOrigin: 'http://localhost' },
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

const ADMIN_USERNAME = 'nocobase';
const ADMIN_PASSWORD = 'admin123';

type Request = (path: string, init?: RequestInit) => Promise<Response>;

/** Signs in and returns the session cookie, the way the browser sends it afterwards. */
async function signIn(
  request: Request,
  credentials: { username: string } | { email: string },
  password: string,
): Promise<string> {
  const path =
    'email' in credentials ? '/auth/sign-in/email' : '/auth/sign-in/username';
  const response = await request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...credentials, password }),
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

function jsonRequest(
  cookie: string | undefined,
  body: unknown,
  method = 'POST',
): RequestInit {
  return {
    method,
    headers: {
      'content-type': 'application/json',
      // Cookie-authenticated writes are checked against the trusted origin the configuration names.
      origin: 'http://localhost',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  };
}

/** Creates a person through the users API and returns the id. */
async function createUser(
  request: Request,
  adminCookie: string,
  user: { name: string; email: string; password: string },
): Promise<string> {
  const response = await request('/users', jsonRequest(adminCookie, user));
  expect(response.status).toBe(201);
  const payload = (await response.json()) as { data: { id: string } };
  return payload.data.id;
}

/** Hands a permission set to a person the way the Roles page does. */
async function assignPermissionSet(
  request: Request,
  adminCookie: string,
  key: string,
  subjectId: string,
): Promise<void> {
  const response = await request(
    `/authorization/permissionSets/${key}/assignments`,
    jsonRequest(adminCookie, { subject: { type: 'user', id: subjectId } }),
  );
  expect(response.status).toBe(201);
}

interface TicketDetailPayload {
  ticket: {
    id: string;
    status: string;
    assigneeId: string | null;
    resolution: string | null;
    reopenCount: number;
    version: number | null;
  };
  version: number | null;
  available: { name: string; allowed: boolean }[];
  history: {
    transitions: { transition: string; from: string | null; to: string }[];
  };
}

test.describe('ticket API', () => {
  test('refuses every ticket endpoint to a caller who is not signed in', async ({
    request,
  }) => {
    const checks: readonly [string, RequestInit | undefined][] = [
      ['/tickets', undefined],
      ['/tickets', { method: 'POST' }],
      ['/tickets/dashboard', undefined],
      ['/tickets/executions', undefined],
      ['/tickets/unknown-ticket', undefined],
      ['/tickets/unknown-ticket/comments', { method: 'POST' }],
      ['/tickets/unknown-ticket/transitions/assign', { method: 'POST' }],
    ];

    for (const [path, init] of checks) {
      const response = await request(path, init);
      expect(response.status, `${init?.method ?? 'GET'} ${path}`).toBe(401);
    }
  });

  test('carries a ticket from reporting to a confirmed closure', async ({
    request,
  }) => {
    const adminCookie = await signIn(
      request,
      { username: ADMIN_USERNAME },
      ADMIN_PASSWORD,
    );
    const employeeId = await createUser(request, adminCookie, {
      name: 'Ella Employee',
      email: 'ella@example.com',
      password: 'employee-pass',
    });
    const engineerId = await createUser(request, adminCookie, {
      name: 'Ed Engineer',
      email: 'ed@example.com',
      password: 'engineer-pass',
    });
    await assignPermissionSet(request, adminCookie, 'engineer', engineerId);

    const employeeCookie = await signIn(
      request,
      { email: 'ella@example.com' },
      'employee-pass',
    );
    const engineerCookie = await signIn(
      request,
      { email: 'ed@example.com' },
      'engineer-pass',
    );

    // The employee reports the problem.
    const created = await request(
      '/tickets',
      jsonRequest(employeeCookie, {
        title: 'The office printer will not turn on',
        description: 'No light, no noise, nothing.',
        category: 'printer',
        urgency: 'high',
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { data: TicketDetailPayload };
    const ticketId = createdBody.data.ticket.id;
    expect(createdBody.data.ticket).toMatchObject({
      status: 'submitted',
      reporterId: employeeId,
    });

    // The reporter sees it; the engineer does not, until it is handed over.
    const employeeList = await request('/tickets', {
      headers: { cookie: employeeCookie },
    });
    expect(employeeList.status).toBe(200);
    await expect(employeeList.json()).resolves.toMatchObject({
      data: [{ id: ticketId }],
    });

    const engineerListBefore = await request('/tickets', {
      headers: { cookie: engineerCookie },
    });
    expect(engineerListBefore.status).toBe(200);
    await expect(engineerListBefore.json()).resolves.toMatchObject({
      data: [],
    });
    const hidden = await request(`/tickets/${ticketId}`, {
      headers: { cookie: engineerCookie },
    });
    expect(hidden.status).toBe(404);

    // Reporting does not let the employee assign work.
    const forbiddenAssign = await request(
      `/tickets/${ticketId}/transitions/assign`,
      jsonRequest(employeeCookie, { assigneeId: engineerId }),
    );
    expect(forbiddenAssign.status).toBe(403);

    // The service desk reads the dashboard and the process administration.
    const dashboard = await request('/tickets/dashboard', {
      headers: { cookie: adminCookie },
    });
    expect(dashboard.status).toBe(200);
    await expect(dashboard.json()).resolves.toMatchObject({
      data: { pendingAssignment: 1, overdueHours: 24 },
    });
    const engineerDashboard = await request('/tickets/dashboard', {
      headers: { cookie: engineerCookie },
    });
    expect(engineerDashboard.status).toBe(403);
    const executions = await request('/tickets/executions', {
      headers: { cookie: adminCookie },
    });
    expect(executions.status).toBe(200);

    // The service desk assigns it; the engineer can now see it and start.
    const assigned = await request(
      `/tickets/${ticketId}/transitions/assign`,
      jsonRequest(adminCookie, {
        assigneeId: engineerId,
        assigneeName: 'Ed Engineer',
      }),
    );
    expect(assigned.status).toBe(200);
    const assignedBody = (await assigned.json()) as {
      data: TicketDetailPayload;
    };
    expect(assignedBody.data.ticket).toMatchObject({
      status: 'assigned',
      assigneeId: engineerId,
    });

    const engineerList = await request('/tickets', {
      headers: { cookie: engineerCookie },
    });
    await expect(engineerList.json()).resolves.toMatchObject({
      data: [{ id: ticketId, status: 'assigned' }],
    });

    const started = await request(
      `/tickets/${ticketId}/transitions/start`,
      jsonRequest(engineerCookie, {}),
    );
    expect(started.status).toBe(200);
    const resolved = await request(
      `/tickets/${ticketId}/transitions/resolve`,
      jsonRequest(engineerCookie, {
        resolution: 'Replaced the power supply unit.',
      }),
    );
    expect(resolved.status).toBe(200);
    const resolvedBody = (await resolved.json()) as {
      data: TicketDetailPayload;
    };
    expect(resolvedBody.data.ticket).toMatchObject({
      status: 'resolved',
      resolution: 'Replaced the power supply unit.',
    });

    // Closing is the reporter's decision. The engineer also holds the employee set, whose `confirm` covers only the
    // tickets that person reported, so this ticket is outside what they may confirm: the answer is the same 404 a
    // ticket they cannot see gets, rather than a hint that it exists.
    const engineerConfirm = await request(
      `/tickets/${ticketId}/transitions/confirm`,
      jsonRequest(engineerCookie, {}),
    );
    expect(engineerConfirm.status).toBe(404);

    // Returning it for further handling reopens the work for the engineer.
    const returned = await request(
      `/tickets/${ticketId}/transitions/returnForRework`,
      jsonRequest(employeeCookie, { reason: 'It still will not print.' }),
    );
    expect(returned.status).toBe(200);
    await expect(returned.json()).resolves.toMatchObject({
      data: { ticket: { status: 'inProgress' } },
    });

    const resolvedAgain = await request(
      `/tickets/${ticketId}/transitions/resolve`,
      jsonRequest(engineerCookie, {
        resolution: 'Replaced the drum unit as well.',
      }),
    );
    expect(resolvedAgain.status).toBe(200);

    const confirmed = await request(
      `/tickets/${ticketId}/transitions/confirm`,
      jsonRequest(employeeCookie, {}),
    );
    expect(confirmed.status).toBe(200);
    const confirmedBody = (await confirmed.json()) as {
      data: TicketDetailPayload;
    };
    expect(confirmedBody.data.ticket.status).toBe('closed');
    expect(
      confirmedBody.data.history.transitions.map(
        ({ transition }) => transition,
      ),
    ).toEqual([
      '$create',
      'assign',
      'start',
      'resolve',
      'returnForRework',
      'resolve',
      'confirm',
    ]);

    // The reporter reopens it once, and the count is recorded.
    const reopened = await request(
      `/tickets/${ticketId}/transitions/reopen`,
      jsonRequest(employeeCookie, { reason: 'The paper jam is back.' }),
    );
    expect(reopened.status).toBe(200);
    await expect(reopened.json()).resolves.toMatchObject({
      data: { ticket: { status: 'inProgress', reopenCount: 1 } },
    });

    // The recorded history is what the management page lists.
    const executionsForTicket = await request(
      `/tickets/executions?ticketId=${ticketId}`,
      { headers: { cookie: adminCookie } },
    );
    expect(executionsForTicket.status).toBe(200);
    await expect(executionsForTicket.json()).resolves.toMatchObject({
      data: { total: 8 },
    });
  });

  test('notifies the person who has to act, with a link back to the ticket', async ({
    request,
  }) => {
    const adminCookie = await signIn(
      request,
      { username: ADMIN_USERNAME },
      ADMIN_PASSWORD,
    );
    const reporterId = await createUser(request, adminCookie, {
      name: 'Nora Reporter',
      email: 'nora@example.com',
      password: 'reporter-pass',
    });
    const engineerId = await createUser(request, adminCookie, {
      name: 'Ned Engineer',
      email: 'ned@example.com',
      password: 'engineer-pass',
    });
    await assignPermissionSet(request, adminCookie, 'engineer', engineerId);

    const reporterCookie = await signIn(
      request,
      { email: 'nora@example.com' },
      'reporter-pass',
    );
    const engineerCookie = await signIn(
      request,
      { email: 'ned@example.com' },
      'engineer-pass',
    );

    interface InboxMessage {
      readonly title: string;
      readonly body: string;
      readonly target: { type: string; path?: string };
    }
    /**
     * The messages one person can see for this ticket.
     *
     * A notice is queued and delivered by the notification plugin's own job, so a message may not be in the inbox the
     * instant the request that caused it answers. The test waits for it the way a person would: by looking again.
     */
    const inboxFor = async (cookie: string, path: string, expected: number) => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const response = await request('/notificationInApp/messages', {
          headers: { cookie },
        });
        expect(response.status).toBe(200);
        const payload = (await response.json()) as { data: InboxMessage[] };
        const matching = payload.data.filter(
          (message) => message.target.path === path,
        );
        if (matching.length >= expected) {
          return matching;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`The inbox never received the message for ${path}.`);
    };

    const created = await request(
      '/tickets',
      jsonRequest(reporterCookie, {
        title: 'The shared drive is unreachable',
        urgency: 'urgent',
      }),
    );
    const createdBody = (await created.json()) as { data: TicketDetailPayload };
    const ticketId = createdBody.data.ticket.id;
    const ticketPath = `/tickets/${ticketId}`;
    expect(createdBody.data.ticket.reporterId).toBe(reporterId);

    // The service desk hears about the new request, and the message points at the ticket.
    const serviceDeskInbox = await inboxFor(adminCookie, ticketPath, 1);
    expect(serviceDeskInbox).toHaveLength(1);
    expect(serviceDeskInbox[0].title).toContain('awaiting assignment');
    expect(serviceDeskInbox[0].body).toContain(
      'The shared drive is unreachable',
    );

    await request(
      `/tickets/${ticketId}/transitions/assign`,
      jsonRequest(adminCookie, {
        assigneeId: engineerId,
        assigneeName: 'Ned Engineer',
      }),
    );
    const engineerInbox = await inboxFor(engineerCookie, ticketPath, 1);
    expect(engineerInbox).toHaveLength(1);
    expect(engineerInbox[0].title).toContain('assigned to you');

    await request(
      `/tickets/${ticketId}/transitions/start`,
      jsonRequest(engineerCookie, {}),
    );
    await request(
      `/tickets/${ticketId}/transitions/resolve`,
      jsonRequest(engineerCookie, { resolution: 'Restarted the file server.' }),
    );
    // The reporter is the one who has to confirm, so the resolution notice goes to them.
    const reporterInbox = await inboxFor(reporterCookie, ticketPath, 1);
    expect(reporterInbox).toHaveLength(1);
    expect(reporterInbox[0].title).toContain('Please confirm');
    expect(reporterInbox[0].body).toContain('Restarted the file server.');

    const unread = await request('/notificationInApp/messages/unreadCount', {
      headers: { cookie: reporterCookie },
    });
    expect(unread.status).toBe(200);
    await expect(unread.json()).resolves.toMatchObject({ data: { count: 1 } });
  });

  test('refuses a stale version and answers a repeated request id once', async ({
    request,
  }) => {
    const adminCookie = await signIn(
      request,
      { username: ADMIN_USERNAME },
      ADMIN_PASSWORD,
    );
    const engineerId = await createUser(request, adminCookie, {
      name: 'Stale Engineer',
      email: 'stale@example.com',
      password: 'engineer-pass',
    });
    await assignPermissionSet(request, adminCookie, 'engineer', engineerId);

    const created = await request(
      '/tickets',
      jsonRequest(adminCookie, { title: 'A ticket to hand out' }),
    );
    const createdBody = (await created.json()) as { data: TicketDetailPayload };
    const ticketId = createdBody.data.ticket.id;
    const version = createdBody.data.version;
    expect(version).toBeTypeOf('number');

    const first = await request(
      `/tickets/${ticketId}/transitions/assign`,
      jsonRequest(adminCookie, {
        assigneeId: engineerId,
        assigneeName: 'Stale Engineer',
        version,
        requestId: 'assign-once',
      }),
    );
    expect(first.status).toBe(200);

    // The same request id is the same submission: it is answered with what it already recorded.
    const repeated = await request(
      `/tickets/${ticketId}/transitions/assign`,
      jsonRequest(adminCookie, {
        assigneeId: engineerId,
        assigneeName: 'Stale Engineer',
        version,
        requestId: 'assign-once',
      }),
    );
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({
      data: { ticket: { status: 'assigned' } },
    });

    // A stale version is refused rather than silently overwriting the newer state.
    const stale = await request(
      `/tickets/${ticketId}/transitions/reassign`,
      jsonRequest(adminCookie, {
        assigneeId: engineerId,
        assigneeName: 'Stale Engineer',
        version,
      }),
    );
    expect(stale.status).toBe(409);
  });
});
