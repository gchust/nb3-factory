// @vitest-environment node
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import { createTestApp } from '@nocobase/app-testing/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

// Authentication refuses to start without a secret, and a development checkout
// has none: the application reads it from the environment in a deployment.
process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

/**
 * The IT repair ticket feature against a real application: its own migrations
 * and seeds on an isolated database, its own runtime, providers and routes,
 * reached the way a browser reaches them. The acceptance walk the feature has
 * to satisfy is a sequence — one colleague reports, another cannot see it, a
 * handler works it, the reporter reads the result — so the steps share one
 * application and one ticket, and each step only asserts what the step before
 * it produced.
 */

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** A write is refused without a trusted `Origin`, which a browser always sends. */
const WRITE_HEADERS = {
  'content-type': 'application/json',
  origin: 'http://localhost',
};

interface ItTicketDto {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly category: string;
  readonly resolutionNote: string | null;
  readonly submitterId: string;
  readonly submitterName: string;
  readonly handlerId: string | null;
  readonly handlerName: string | null;
}

interface ListBody {
  readonly data: readonly ItTicketDto[];
  readonly meta: { readonly total: number };
}

let app: TestApp;
let employeeOne: TestSession;
let employeeTwo: TestSession;
let handler: TestSession;
let administrator: TestSession;

beforeAll(async () => {
  app = await createTestApp({
    createServer: createStandaloneServer,
    // Cookie-authenticated writes are checked against the origin the application
    // believes it is served from; a deployment states it too.
    server: { env: { APP_PUBLIC_ORIGIN: 'http://localhost' } },
  });
  employeeOne = await signIn(app, {
    username: 'employee1',
    password: 'Employee@123',
  });
  employeeTwo = await signIn(app, {
    username: 'employee2',
    password: 'Employee@123',
  });
  handler = await signIn(app, {
    username: 'handler1',
    password: 'Handler@123',
  });
  administrator = await signIn(app, DEFAULT_ADMIN_CREDENTIALS);
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('the IT repair ticket API', () => {
  it('refuses a caller with no session', async () => {
    expect((await app.request('/itTickets')).status).toBe(401);
    const write = await app.request('/itTickets', {
      method: 'POST',
      headers: WRITE_HEADERS,
      body: JSON.stringify({
        title: 'Anonymous ticket',
        category: 'other',
      }),
    });
    expect(write.status).toBe(401);
    await expect(write.json()).resolves.toMatchObject({
      error: { status: 'UNAUTHENTICATED' },
    });
  });

  it('shows an employee their own tickets and a handler every ticket', async () => {
    const own: ListBody = await employeeOne
      .fetch('/itTickets?pageSize=100')
      .then((response) => response.json());
    // The colleague's own two, and not the one that belongs to employee two.
    expect(own.meta.total).toBe(2);
    expect(own.data.map((ticket) => ticket.id).sort()).toEqual([
      'demo-ticket-1',
      'demo-ticket-3',
    ]);
    expect(ticketIn(own, 'demo-ticket-1')?.status).toBe('pending');
    expect(ticketIn(own, 'demo-ticket-3')?.status).toBe('completed');

    const other: ListBody = await employeeTwo
      .fetch('/itTickets?pageSize=100')
      .then((response) => response.json());
    expect(other.meta.total).toBe(1);
    expect(ticketIn(other, 'demo-ticket-2')).toMatchObject({
      status: 'processing',
      handlerName: 'Hank Ford',
    });

    const handlerList: ListBody = await handler
      .fetch('/itTickets?pageSize=100')
      .then((response) => response.json());
    expect(handlerList.meta.total).toBe(3);
    expect(handlerList.data.map((ticket) => ticket.id).sort()).toEqual([
      'demo-ticket-1',
      'demo-ticket-2',
      'demo-ticket-3',
    ]);
  });

  it('records the reporter and keeps the new ticket in their own list', async () => {
    const created = await employeeOne.fetch('/itTickets', {
      method: 'POST',
      headers: WRITE_HEADERS,
      body: JSON.stringify({
        title: 'Keyboard repeats letters',
        category: 'computer',
        description: 'Typing one letter produces two or three of them.',
      }),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      data: {
        title: 'Keyboard repeats letters',
        status: 'pending',
        category: 'computer',
        submitterId: employeeOne.user.id,
        submitterName: 'Emma Reed',
        handlerId: null,
        handlerName: null,
        resolutionNote: null,
      },
    });

    // Read back in a second request: what the reporter sees is what was stored.
    const list: ListBody = await employeeOne
      .fetch('/itTickets?pageSize=100')
      .then((response) => response.json());
    const ticket = list.data.find(
      (candidate) => candidate.title === 'Keyboard repeats letters',
    );
    expect(ticket).toBeDefined();
    expect(ticket?.status).toBe('pending');
    expect(ticket?.submitterId).toBe(employeeOne.user.id);
  });

  it("hides one employee's ticket from another, and both from the handler actions", async () => {
    const list: ListBody = await employeeOne
      .fetch('/itTickets?pageSize=100')
      .then((response) => response.json());
    const ticketId = list.data.find(
      (candidate) => candidate.title === 'Keyboard repeats letters',
    )?.id;
    expect(ticketId).toBeTruthy();

    // Not in the other colleague's list, and not readable by link either: a
    // ticket the caller may not see is answered exactly like a missing one.
    const otherList: ListBody = await employeeTwo
      .fetch('/itTickets?pageSize=100')
      .then((response) => response.json());
    expect(otherList.data.map((candidate) => candidate.id)).not.toContain(
      ticketId,
    );
    const direct = await employeeTwo.fetch(`/itTickets/${ticketId}`);
    expect(direct.status).toBe(404);
    await expect(direct.json()).resolves.toMatchObject({
      error: { status: 'NOT_FOUND', reason: 'IT_TICKET_NOT_FOUND' },
    });

    // Reporting is all an employee may do to a ticket.
    for (const session of [employeeOne, employeeTwo]) {
      const start = await session.fetch(`/itTickets/${ticketId}/start`, {
        method: 'POST',
        headers: WRITE_HEADERS,
      });
      expect(start.status).toBe(403);
    }
  });

  it('lets a handler start the ticket and records who took it', async () => {
    const ticketId = await ticketIdOf('Keyboard repeats letters');
    const started = await handler.fetch(`/itTickets/${ticketId}/start`, {
      method: 'POST',
      headers: WRITE_HEADERS,
    });
    expect(started.status).toBe(200);
    await expect(started.json()).resolves.toMatchObject({
      data: {
        status: 'processing',
        handlerId: handler.user.id,
        handlerName: 'Hank Ford',
      },
    });

    // Reading it again after the write shows the same state, which is what a
    // refresh does in the browser.
    await expect(
      handler
        .fetch(`/itTickets/${ticketId}`)
        .then((response) => response.json()),
    ).resolves.toMatchObject({
      data: { status: 'processing', handlerName: 'Hank Ford' },
    });

    // A ticket can be taken once.
    const again = await handler.fetch(`/itTickets/${ticketId}/start`, {
      method: 'POST',
      headers: WRITE_HEADERS,
    });
    expect(again.status).toBe(400);
    await expect(again.json()).resolves.toMatchObject({
      error: {
        status: 'FAILED_PRECONDITION',
        reason: 'IT_TICKET_NOT_PENDING',
      },
    });
  });

  it('requires a resolution note before the ticket is complete, and then locks it', async () => {
    const ticketId = await ticketIdOf('Keyboard repeats letters');
    const empty = await handler.fetch(`/itTickets/${ticketId}/complete`, {
      method: 'POST',
      headers: WRITE_HEADERS,
      body: JSON.stringify({ resolutionNote: '   ' }),
    });
    expect(empty.status).toBe(400);

    // A refused completion leaves the ticket exactly where it was.
    await expect(
      handler
        .fetch(`/itTickets/${ticketId}`)
        .then((response) => response.json()),
    ).resolves.toMatchObject({
      data: { status: 'processing', resolutionNote: null },
    });

    const completed = await handler.fetch(`/itTickets/${ticketId}/complete`, {
      method: 'POST',
      headers: WRITE_HEADERS,
      body: JSON.stringify({
        resolutionNote: 'Replaced the keyboard; the replacement types once.',
      }),
    });
    expect(completed.status).toBe(200);
    await expect(completed.json()).resolves.toMatchObject({
      data: {
        status: 'completed',
        resolutionNote: 'Replaced the keyboard; the replacement types once.',
      },
    });

    const repeated = await handler.fetch(`/itTickets/${ticketId}/complete`, {
      method: 'POST',
      headers: WRITE_HEADERS,
      body: JSON.stringify({ resolutionNote: 'A second resolution.' }),
    });
    expect(repeated.status).toBe(400);
    await expect(repeated.json()).resolves.toMatchObject({
      error: {
        status: 'FAILED_PRECONDITION',
        reason: 'IT_TICKET_ALREADY_COMPLETED',
      },
    });

    // The stored row is still the first resolution, not the refused second one.
    await expect(
      employeeOne
        .fetch(`/itTickets/${ticketId}`)
        .then((response) => response.json()),
    ).resolves.toMatchObject({
      data: {
        status: 'completed',
        resolutionNote: 'Replaced the keyboard; the replacement types once.',
      },
    });
  });

  it('reports the result to the reporter and filters by status', async () => {
    const completed: ListBody = await employeeOne
      .fetch('/itTickets?status=completed&pageSize=100')
      .then((response) => response.json());
    expect(completed.data.map((ticket) => ticket.id)).toContain(
      'demo-ticket-3',
    );
    const pending: ListBody = await employeeOne
      .fetch('/itTickets?status=pending&pageSize=100')
      .then((response) => response.json());
    expect(pending.data.every((ticket) => ticket.status === 'pending')).toBe(
      true,
    );
    expect(pending.data.map((ticket) => ticket.id)).not.toContain(
      'demo-ticket-3',
    );
    const processing: ListBody = await employeeOne
      .fetch('/itTickets?status=processing&pageSize=100')
      .then((response) => response.json());
    expect(processing.data).toEqual([]);

    // The filter is the caller's own view of it, still: the colleague's
    // processing ticket is not in the reporter's `processing` page.
    const otherProcessing: ListBody = await employeeTwo
      .fetch('/itTickets?status=processing&pageSize=100')
      .then((response) => response.json());
    expect(otherProcessing.data.map((ticket) => ticket.id)).toEqual([
      'demo-ticket-2',
    ]);
  });

  it('lets an administrator give a new colleague the same permissions', async () => {
    const created = await administrator.fetch('/users', {
      method: 'POST',
      headers: WRITE_HEADERS,
      body: JSON.stringify({
        name: 'Nina Cole',
        username: 'itTicketsColleague',
        email: 'itTicketsColleague@example.com',
        password: 'Colleague@123',
        roleScopes: { app: ['it-ticket-employee'] },
      }),
    });
    expect(created.status).toBe(201);

    const colleague = await signIn(app, {
      username: 'itTicketsColleague',
      password: 'Colleague@123',
    });
    // The new colleague holds the employee permission set: a page in the
    // application, the ability to report, and no other colleague's tickets.
    const list = await colleague.fetch('/itTickets?pageSize=100');
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({
      data: [],
      meta: { total: 0 },
    });

    const reported = await colleague.fetch('/itTickets', {
      method: 'POST',
      headers: WRITE_HEADERS,
      body: JSON.stringify({
        title: 'Mouse cursor jumps',
        category: 'other',
      }),
    });
    expect(reported.status).toBe(201);
    await expect(reported.json()).resolves.toMatchObject({
      data: { status: 'pending', submitterName: 'Nina Cole' },
    });
  });
});

/** One ticket of a list body, or `undefined` when the list does not hold it. */
function ticketIn(body: ListBody, id: string): ItTicketDto | undefined {
  return body.data.find((candidate) => candidate.id === id);
}

/** The id of the ticket the walk of this file created, found by its title. */
async function ticketIdOf(title: string): Promise<string> {
  const list: ListBody = await employeeOne
    .fetch('/itTickets?pageSize=100')
    .then((response) => response.json());
  const ticket = list.data.find((candidate) => candidate.title === title);
  if (!ticket) {
    throw new Error(`No ticket titled "${title}" is stored.`);
  }
  return ticket.id;
}
