// @vitest-environment node

import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { createTestApp } from '@nocobase/app-testing/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** A ticket as `/api/tickets` returns it. */
interface Ticket {
  readonly id: number;
  readonly title: string;
  readonly category: string;
  readonly description: string | null;
  readonly status: string;
  readonly resolution: string | null;
  readonly submitterId: string;
  readonly submitterName: string;
  readonly handlerId: string | null;
  readonly handlerName: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface TicketList {
  readonly data: Ticket[];
  readonly meta: { readonly total: number };
}

const ORIGIN = 'http://localhost';
const EMPLOYEE_PASSWORD = 'Ticket123!';
const HANDLER_PASSWORD = 'Handler123!';
const PENDING_TITLE = '工位台式机无法开机';
const IN_PROGRESS_TITLE = '企业邮箱无法登录';
const COMPLETED_TITLE = '会议室投影仪没有信号';

let app: TestApp;
let employee: TestSession;
let colleague: TestSession;
let handler: TestSession;
let administrator: TestSession;
let pendingTicketId: number | undefined;
let createdTicketId: number | undefined;

async function read<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/**
 * A state-changing request. The application refuses one that does not carry the origin it is addressed to, so the
 * test sends the origin a browser would.
 */
function post(
  session: TestSession,
  path: string,
  body?: unknown,
): Promise<Response> {
  return session.fetch(path, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function list(session: TestSession, query = ''): Promise<TicketList> {
  const response = await session.fetch(`/tickets${query}`);
  expect(response.status).toBe(200);
  return read<TicketList>(response);
}

function titleOf(tickets: readonly Ticket[], title: string): Ticket {
  const ticket = tickets.find((item) => item.title === title);
  expect(ticket, `a ticket titled "${title}"`).toBeDefined();
  return ticket!;
}

beforeAll(async () => {
  app = await createTestApp({
    createServer: createStandaloneServer,
    config: {
      // The application refuses a cookie-bearing write from an origin it does not know. A browser reaches a deployment
      // through its public origin, so the test names one and sends it with every write.
      app: { publicOrigin: ORIGIN },
      auth: { secret: 'ticket-test-secret-at-least-32-characters' },
    },
  });

  // The demo seed creates these three identities with the permission sets the feature needs; the default
  // administrator holds the unrestricted set. Signing in through the application's own route keeps the test on the
  // same authentication path a browser uses.
  employee = await signIn(app, {
    username: 'zhangwei',
    password: EMPLOYEE_PASSWORD,
  });
  colleague = await signIn(app, {
    username: 'lina',
    password: EMPLOYEE_PASSWORD,
  });
  handler = await signIn(app, {
    username: 'wangqiang',
    password: HANDLER_PASSWORD,
  });
  administrator = await signIn(app, DEFAULT_ADMIN_CREDENTIALS);
}, 180_000);

afterAll(async () => {
  if (app) await app.close();
});

describe('tickets API access', () => {
  it('refuses an anonymous caller', async () => {
    const response = await app.request('/tickets');
    expect(response.status).toBe(401);
  });

  it('shows an employee only their own tickets', async () => {
    const { data, meta } = await list(employee);
    expect(meta.total).toBe(2);
    expect(data.map((ticket) => ticket.title).sort()).toEqual(
      [COMPLETED_TITLE, PENDING_TITLE].sort(),
    );
    // The demonstrated isolation is the record scope, not the filter: every row belongs to the caller.
    expect(new Set(data.map((ticket) => ticket.submitterId))).toEqual(
      new Set([employee.user.id]),
    );
    expect(data[0].submitterName).toBe('张伟');

    pendingTicketId = titleOf(data, PENDING_TITLE).id;
    expect(pendingTicketId).toBeGreaterThan(0);
  });

  it('hides another employee’s ticket even when its id is opened directly', async () => {
    const theirs = titleOf((await list(colleague)).data, IN_PROGRESS_TITLE);
    const denied = await employee.fetch(`/tickets/${theirs.id}`);
    expect(denied.status).toBe(404);
    expect(
      (await read<{ error: { reason: string } }>(denied)).error.reason,
    ).toBe('TICKET_NOT_FOUND');

    const missing = await employee.fetch('/tickets/999999');
    expect(missing.status).toBe(404);
  });

  it('shows every ticket to a handler and to the root administrator', async () => {
    for (const session of [handler, administrator]) {
      const { data, meta } = await list(session);
      expect(meta.total).toBe(3);
      expect(data.map((ticket) => ticket.title).sort()).toEqual(
        [PENDING_TITLE, IN_PROGRESS_TITLE, COMPLETED_TITLE].sort(),
      );
    }
  });

  it('filters the list by status and rejects an unknown one', async () => {
    for (const status of ['pending', 'in_progress', 'completed']) {
      const { data, meta } = await list(handler, `?status=${status}`);
      expect(meta.total).toBe(1);
      expect(data.map((ticket) => ticket.status)).toEqual([status]);
    }

    const rejected = await handler.fetch('/tickets?status=unknown');
    expect(rejected.status).toBe(400);
  });

  it('refuses work to an identity without the handler grant', async () => {
    for (const [action, body] of [
      ['start', undefined],
      ['complete', { resolution: '员工无权处理' }],
    ] as const) {
      const response = await post(
        employee,
        `/tickets/${pendingTicketId}/${action}`,
        body,
      );
      expect(response.status).toBe(403);
      expect(
        (await read<{ error: { reason: string } }>(response)).error.reason,
      ).toBe('AUTHORIZATION_DENIED');
    }
  });
});

describe('submitting a ticket', () => {
  it('rejects a body without the required fields', async () => {
    for (const body of [
      {},
      { title: '', category: 'computer' },
      { title: '缺少分类' },
      // The body is a strict object, so an unknown field is refused rather than dropped.
      { title: '多余字段', category: 'other', submitterId: 'spoofed' },
    ]) {
      const response = await post(employee, '/tickets', body);
      expect(response.status).toBe(400);
    }
  });

  it('records the signed-in employee as the submitter', async () => {
    const response = await post(employee, '/tickets', {
      title: '副屏没有信号',
      category: 'other',
      description: '扩展屏一直黑屏，主屏正常。',
    });
    expect(response.status).toBe(201);
    const { data } = await read<{ data: Ticket }>(response);
    createdTicketId = data.id;
    expect(data.status).toBe('pending');
    expect(data.submitterId).toBe(employee.user.id);
    expect(data.submitterName).toBe('张伟');
    expect(data.handlerId).toBeNull();
    expect(data.handlerName).toBeNull();
    expect(data.resolution).toBeNull();
    expect(data.createdAt).toBeTruthy();

    const { data: mine, meta } = await list(employee);
    expect(meta.total).toBe(3);
    expect(mine.map((ticket) => ticket.id)).toContain(createdTicketId);

    const detail = await employee.fetch(`/tickets/${createdTicketId}`);
    expect(detail.status).toBe(200);
  });

  it('refuses a handler who holds no submit grant', async () => {
    const response = await post(handler, '/tickets', {
      title: '处理人不能提单',
      category: 'other',
    });
    expect(response.status).toBe(403);
  });
});

describe('handling a ticket', () => {
  it('walks a submitted ticket to completion and freezes it there', async () => {
    // A handler sees the employee's new ticket.
    expect((await handler.fetch(`/tickets/${createdTicketId}`)).status).toBe(
      200,
    );

    const started = await post(handler, `/tickets/${createdTicketId}/start`);
    expect(started.status).toBe(200);
    const inProgress = (await read<{ data: Ticket }>(started)).data;
    expect(inProgress.status).toBe('in_progress');
    expect(inProgress.handlerId).toBe(handler.user.id);
    expect(inProgress.handlerName).toBe('王强');
    expect(inProgress.startedAt).toBeTruthy();
    expect(inProgress.completedAt).toBeNull();

    // Starting twice, and starting a ticket that is not pending, are preconditions, not input errors.
    const restarted = await post(handler, `/tickets/${createdTicketId}/start`);
    expect(restarted.status).toBe(400);
    expect(
      (await read<{ error: { reason: string } }>(restarted)).error.reason,
    ).toBe('TICKET_ALREADY_STARTED');

    const completed = await post(
      handler,
      `/tickets/${createdTicketId}/complete`,
      { resolution: '更换了扩展屏的线缆，重新识别后正常。' },
    );
    expect(completed.status).toBe(200);
    const done = (await read<{ data: Ticket }>(completed)).data;
    expect(done.status).toBe('completed');
    expect(done.resolution).toBe('更换了扩展屏的线缆，重新识别后正常。');
    expect(done.completedAt).toBeTruthy();
    expect(done.startedAt).toBe(inProgress.startedAt);

    // A completed ticket is immutable: neither completing it again nor starting it changes it.
    const repeated = await post(
      handler,
      `/tickets/${createdTicketId}/complete`,
      { resolution: '重复处理' },
    );
    expect(repeated.status).toBe(400);
    expect(
      (await read<{ error: { reason: string } }>(repeated)).error.reason,
    ).toBe('TICKET_NOT_IN_PROGRESS');

    const reversed = await post(handler, `/tickets/${createdTicketId}/start`);
    expect(reversed.status).toBe(400);
    expect(
      (await read<{ error: { reason: string } }>(reversed)).error.reason,
    ).toBe('TICKET_ALREADY_STARTED');

    // Completing a ticket that was never started is refused too.
    const notStarted = await post(
      handler,
      `/tickets/${pendingTicketId}/complete`,
      { resolution: '未开始就完成' },
    );
    expect(notStarted.status).toBe(400);

    const notFound = await post(handler, '/tickets/999999/start');
    expect(notFound.status).toBe(404);

    // The submitter still sees their own completed ticket.
    const own = await employee.fetch(`/tickets/${createdTicketId}`);
    expect(own.status).toBe(200);
    expect((await read<{ data: Ticket }>(own)).data.status).toBe('completed');
  });
});

describe('permission administration', () => {
  it('lets the administrator grant the ticket permissions to a colleague', async () => {
    const sets = await administrator.fetch('/authorization/permissionSets');
    expect(sets.status).toBe(200);
    const keys = (await read<{ data: { key: string }[] }>(sets)).data.map(
      (set) => set.key,
    );
    expect(keys).toEqual(
      expect.arrayContaining(['ticket-employee', 'ticket-handler']),
    );

    // The grant an administrator makes from the Users page: assign the handler set to a colleague, then revoke it.
    const assigned = await post(
      administrator,
      '/authorization/permissionSets/ticket-handler/assignments',
      { subject: { type: 'user', id: colleague.user.id } },
    );
    expect(assigned.status).toBe(201);
    const assignment = (await read<{ data: { id: string } }>(assigned)).data;

    const revoked = await administrator.fetch(
      `/authorization/permissionSets/ticket-handler/assignments/${assignment.id}`,
      { method: 'DELETE', headers: { origin: ORIGIN } },
    );
    expect(revoked.status).toBe(204);

    // An employee cannot administer permissions.
    expect((await employee.fetch('/authorization/permissionSets')).status).toBe(
      403,
    );
  });
});

describe('the API document', () => {
  it('declares every ticket operation and keeps the schemas sound', async () => {
    expect(findUndeclaredApiRoutes(app.application)).toEqual([]);

    const document = await app.application.container
      .resolve(apiDocsToken)
      .getDocument();
    expect(findApiDocumentSchemaProblems(document)).toEqual([]);

    expect(document.paths?.['/api/tickets']?.get?.operationId).toBe(
      'listTickets',
    );
    expect(document.paths?.['/api/tickets']?.post?.operationId).toBe(
      'createTicket',
    );
    expect(document.paths?.['/api/tickets/{ticketId}']?.get?.operationId).toBe(
      'getTicket',
    );

    // A write route with a permission check answers 401, 403 and 500 like every other, its own 400 precondition and
    // its own 404; the document lists exactly those.
    const start = document.paths?.['/api/tickets/{ticketId}/start']?.post;
    expect(start?.operationId).toBe('startTicket');
    expect(Object.keys(start?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '500',
    ]);
    expect(
      document.paths?.['/api/tickets/{ticketId}/complete']?.post?.operationId,
    ).toBe('completeTicket');
  });
});
