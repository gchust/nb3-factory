// @vitest-environment node
import { createTestApp, type TestApp } from '@nocobase/app-testing/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { itTicketServiceToken } from '../../server/services/it-ticket-token.js';
import { createStandaloneServer } from '../../server/standalone.js';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

let app: TestApp;
let apiKey: string;
let adminId: string;

beforeAll(async () => {
  app = await createTestApp({
    createServer: createStandaloneServer,
    config: { app: { sampleData: false } },
  });
  const admin = await app.database
    .query()
    .selectFrom('user')
    .select(['id'])
    .where('username', '=', 'nocobase')
    .executeTakeFirstOrThrow();
  adminId = admin.id;

  const signIn = await app.request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
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
    body: JSON.stringify({ name: 'it-ticket-integration' }),
  });
  if (created.status !== 200) {
    throw new Error(`API key creation failed with ${created.status}`);
  }
  apiKey = ((await created.json()) as { key: string }).key;
}, 300_000);

afterAll(async () => {
  await app?.close();
});

function request(path: string, init: RequestInit = {}): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: {
      'x-api-key': apiKey,
      ...(init.body && !(init.body instanceof FormData)
        ? { 'content-type': 'application/json' }
        : {}),
      ...init.headers,
    },
  });
}

describe('IT ticket access and assignment', () => {
  it('gives every signed-in person the employee set and root administrators the service desk set', async () => {
    const assignments = await app.database
      .query()
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['id', 'subjectType', 'subjectId', 'permissionSetKey'])
      .where('id', 'in', [
        'authenticated:*:it-employee',
        `user:${adminId}:it-service-desk`,
      ])
      .execute();
    expect(assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'authenticated:*:it-employee',
          subjectType: 'authenticated',
          subjectId: '*',
          permissionSetKey: 'it-employee',
        }),
        expect.objectContaining({
          id: `user:${adminId}:it-service-desk`,
          subjectType: 'user',
          subjectId: adminId,
          permissionSetKey: 'it-service-desk',
        }),
      ]),
    );
  });

  it('supports assignment, engineer work, return, and closure with notifications', async () => {
    const created = await request('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Printer is offline',
        description: 'The office printer is not reachable.',
        urgency: 'high',
        fileIds: [],
      }),
    });
    expect(created.status).toBe(201);
    const ticket = (await created.json()) as { data: { id: number } };

    const engineers = await request('/tickets/engineers');
    expect(engineers.status).toBe(200);
    const engineerPage = (await engineers.json()) as {
      data: { id: string }[];
    };
    expect(engineerPage.data.map((person) => person.id)).toContain(adminId);

    const assigned = await request(`/tickets/${ticket.data.id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeId: adminId }),
    });
    expect(assigned.status).toBe(200);

    const engineerAssignment = await app.database
      .query()
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['id'])
      .where('id', '=', `user:${adminId}:it-engineer`)
      .executeTakeFirst();
    expect(engineerAssignment?.id).toBe(`user:${adminId}:it-engineer`);

    const dashboard = await request('/tickets/dashboard');
    expect(dashboard.status).toBe(200);
    const overview = (await dashboard.json()) as {
      data: {
        inProgress: number;
        workload: { id: string; open: number }[];
      };
    };
    expect(overview.data.inProgress).toBe(1);
    expect(overview.data.workload).toContainEqual(
      expect.objectContaining({ id: adminId, open: 1 }),
    );

    const unread = await request('/notificationInApp/messages/unreadCount');
    expect(unread.status).toBe(200);
    const inbox = (await unread.json()) as { data: { count: number } };
    expect(inbox.data.count).toBeGreaterThan(0);

    const messages = await request('/notificationInApp/messages?pageSize=20');
    expect(messages.status).toBe(200);
    const inboxPage = (await messages.json()) as {
      data: { target?: { type: string; path?: string } }[];
    };
    expect(inboxPage.data).toContainEqual(
      expect.objectContaining({
        target: { type: 'route', path: '/it-tickets/1' },
      }),
    );

    const employee = await request('/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Employee',
        username: 'employee',
        email: 'employee@example.com',
        password: 'Employee123!',
      }),
    });
    expect(employee.status).toBe(201);
    const employeeId = ((await employee.json()) as { data: { id: string } })
      .data.id;

    const roster = await request('/tickets/engineers');
    expect(roster.status).toBe(200);
    const rosterPage = (await roster.json()) as {
      data: { id: string }[];
    };
    expect(rosterPage.data).toContainEqual(
      expect.objectContaining({ id: adminId }),
    );
    expect(rosterPage.data).not.toContainEqual(
      expect.objectContaining({ id: employeeId }),
    );

    const employeeKey = await signInApiKey('employee', 'Employee123!');
    const employeeRequest = (
      path: string,
      init: RequestInit = {},
    ): Promise<Response> =>
      app.request(path, {
        ...init,
        headers: {
          'x-api-key': employeeKey,
          ...(init.body && !(init.body instanceof FormData)
            ? { 'content-type': 'application/json' }
            : {}),
          ...init.headers,
        },
      });

    const visible = await employeeRequest('/tickets');
    expect(visible.status).toBe(200);
    const visiblePage = (await visible.json()) as {
      data: { id: number }[];
      meta: { total: number };
    };
    expect(visiblePage.meta.total).toBe(0);
    expect(visiblePage.data).toEqual([]);

    const ownTicket = await employeeRequest('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Cannot open the CRM',
        description: 'The CRM reports a connection error.',
        urgency: 'medium',
        fileIds: [],
      }),
    });
    expect(ownTicket.status).toBe(201);
    const ownPage = (await employeeRequest('/tickets').then((response) =>
      response.json(),
    )) as { meta: { total: number } };
    expect(ownPage.meta.total).toBe(1);

    const secondId = ((await ownTicket.json()) as { data: { id: number } }).data
      .id;
    const secondAssigned = await request(`/tickets/${secondId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeId: adminId }),
    });
    expect(secondAssigned.status).toBe(200);

    const engineerSteps = [
      [`/tickets/${secondId}/comments`, { content: 'Checking the error now.' }],
      [`/tickets/${secondId}/progress`, { content: 'Reproduced the error.' }],
      [
        `/tickets/${secondId}/resolve`,
        { resolution: 'Restarted the application server.' },
      ],
    ] as const;
    for (const [path, body] of engineerSteps) {
      const response = await request(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(200);
    }

    const returned = await employeeRequest(`/tickets/${secondId}/return`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'The error is still there.' }),
    });
    expect(returned.status).toBe(200);
    expect(
      ((await returned.json()) as { data: { status: string } }).data.status,
    ).toBe('in_progress');

    for (const [path, body] of [
      [
        `/tickets/${secondId}/progress`,
        { content: 'Applying a full restart.' },
      ],
      [
        `/tickets/${secondId}/resolve`,
        { resolution: 'Cleared the corrupted cache and restarted.' },
      ],
    ] as const) {
      const response = await request(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(200);
    }

    const closed = await employeeRequest(`/tickets/${secondId}/close`, {
      method: 'POST',
    });
    expect(closed.status).toBe(200);
    expect(
      ((await closed.json()) as { data: { status: string } }).data.status,
    ).toBe('closed');
  });

  it('rejects a corrupt screenshot before binding it to a ticket', async () => {
    const corrupt = await upload(
      new File(['This is not PNG image data.\n'], 'corrupt.png', {
        type: 'image/png',
      }),
    );
    const rejected = await request('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Screenshot with a broken image',
        description: 'The attached file claims to be a PNG but is plain text.',
        urgency: 'low',
        fileIds: [corrupt.id],
      }),
    });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ reason: 'ATTACHMENT_INVALID' }),
      }),
    );
    const unbound = await app.database
      .query()
      .selectFrom('itTicketFiles')
      .select(['ticketId'])
      .where('id', '=', corrupt.id)
      .executeTakeFirstOrThrow();
    expect(unbound.ticketId).toBeNull();

    const valid = await upload(validPngFile());
    const created = await request('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Screenshot with a real image',
        description: 'The attached file is a complete PNG image.',
        urgency: 'low',
        fileIds: [valid.id],
      }),
    });
    expect(created.status).toBe(201);
    const ticket = (await created.json()) as {
      data: { attachments: { id: string; filename: string }[] };
    };
    expect(ticket.data.attachments).toEqual([
      expect.objectContaining({ id: valid.id, filename: 'sample.png' }),
    ]);
  });

  it('reminds the service desk once about a ticket older than 24 hours', async () => {
    const created = await request('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Laptop will not start',
        description: 'The laptop stopped starting this morning.',
        urgency: 'medium',
        fileIds: [],
      }),
    });
    expect(created.status).toBe(201);
    const ticketId = ((await created.json()) as { data: { id: number } }).data
      .id;
    await app.database
      .query()
      .updateTable('itTickets')
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where('id', '=', ticketId)
      .execute();

    const service = app.application.container.resolve(itTicketServiceToken);
    await expect(service.remindOverdue()).resolves.toBe(1);
    await expect(service.remindOverdue()).resolves.toBe(0);

    const messages = await request('/notificationInApp/messages?pageSize=50');
    expect(messages.status).toBe(200);
    const inboxPage = (await messages.json()) as {
      data: { target?: { type: string; path?: string } }[];
    };
    expect(
      inboxPage.data.filter(
        (message) =>
          message.target?.type === 'route' &&
          message.target.path === `/it-tickets/${ticketId}`,
      ),
    ).toHaveLength(1);
  });
});

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function validPngFile(): File {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (character) =>
    character.charCodeAt(0),
  );
  return new File([bytes.buffer as ArrayBuffer], 'sample.png', {
    type: 'image/png',
  });
}

async function upload(file: File): Promise<{ id: string }> {
  const body = new FormData();
  body.append('file', file);
  const response = await request('/itTicketFiles/uploadMany', {
    method: 'POST',
    body,
  });
  expect(response.ok).toBe(true);
  const result = (await response.json()) as {
    data: { records: { id: string }[] };
  };
  return result.data.records[0]!;
}

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
    body: JSON.stringify({ name: `integration-${username}` }),
  });
  expect(created.status).toBe(200);
  return ((await created.json()) as { key: string }).key;
}
