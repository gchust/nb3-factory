// @vitest-environment node

import type { Auth, AuthSession } from '@nocobase/app-plugin-authentication';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import type { Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiRoutes } from '../../server/routes/it-tickets.js';
import { IT_TICKET_HANDLER_SET } from '../../server/providers/it-tickets-constants.js';
import {
  ItTicketService,
  itTicketServiceToken,
  resolveItTicketRole,
  type ItTicketRoleReader,
} from '../../server/providers/it-tickets.js';
import type { ItTicketTestDatabase } from '../fixtures/it-tickets-database.js';
import { createItTicketTestDatabase } from '../fixtures/it-tickets-database.js';

const HANDLER = 'user-handler';
const EMPLOYEE_ONE = 'user-employee-1';
const EMPLOYEE_TWO = 'user-employee-2';
const ADMIN = 'user-admin';

const SEED_AT = new Date('2026-09-01T08:00:00.000Z');

describe('IT ticket API', () => {
  let context: ItTicketTestDatabase;
  let request: (
    path: string,
    options?: { user?: string; method?: string; body?: unknown },
  ) => Promise<Response>;
  let ticketIds: Record<
    'own' | 'otherInProgress' | 'ownCompleted' | 'otherPending',
    number
  >;

  beforeEach(async () => {
    context = await createItTicketTestDatabase();
    await seedIdentity(context);
    ticketIds = await seedTickets(context);

    const permissionSets: ItTicketRoleReader = {
      unrestricted: async ({ principal }) => principal.id === ADMIN,
      getEffective: async ({ principal }) =>
        principal.id === HANDLER
          ? [{ key: IT_TICKET_HANDLER_SET, grants: [] }]
          : [],
    };
    const service = new ItTicketService(context.database, permissionSets);

    const auth = {
      required:
        () =>
        async (
          honoContext: Context<{ Variables: { auth: AuthSession } }>,
          next: () => Promise<void>,
        ) => {
          const userId = honoContext.req.header('x-test-user');
          if (!userId) {
            return honoContext.json({ code: 'UNAUTHORIZED' }, 401);
          }
          honoContext.set('auth', {
            user: { id: userId, name: userId },
            session: {},
          } as unknown as AuthSession);
          await next();
        },
    } as unknown as Auth;

    const container = {
      resolve: (token: unknown) => {
        if (token === authenticationToken) {
          return auth;
        }
        if (token === itTicketServiceToken) {
          return service;
        }
        throw new Error('Unexpected service token in test.');
      },
    };
    const app = { container } as unknown as Application;
    const router = await apiRoutes.createRouter(app);

    request = (path, options = {}) => {
      const headers = new Headers();
      if (options.user) {
        headers.set('x-test-user', options.user);
      }
      if (options.body !== undefined) {
        headers.set('content-type', 'application/json');
      }
      return router.request(path, {
        method: options.method ?? 'GET',
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    };
  });

  afterEach(async () => {
    await context.dispose();
  });

  describe('authentication', () => {
    it('rejects an anonymous request on every path', async () => {
      const paths: [string, string][] = [
        ['GET', '/it-tickets'],
        ['POST', '/it-tickets'],
        ['GET', `/it-tickets/${ticketIds.own}`],
        ['POST', `/it-tickets/${ticketIds.own}/start`],
        ['POST', `/it-tickets/${ticketIds.own}/complete`],
      ];
      for (const [method, path] of paths) {
        const response = await request(path, { method });
        expect(response.status, `${method} ${path}`).toBe(401);
      }
    });
  });

  describe('listing', () => {
    it('gives an employee only their own tickets', async () => {
      const response = await request('/it-tickets', { user: EMPLOYEE_ONE });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { id: number; submitterId: string }[];
        meta: { canProcess: boolean };
      };
      expect(body.meta.canProcess).toBe(false);
      expect(body.data.map((ticket) => ticket.id).sort()).toEqual(
        [ticketIds.own, ticketIds.ownCompleted].sort(),
      );
      expect(
        body.data.every((ticket) => ticket.submitterId === EMPLOYEE_ONE),
      ).toBe(true);
    });

    it('gives an employee their own tickets under a status filter', async () => {
      const response = await request('/it-tickets?status=completed', {
        user: EMPLOYEE_ONE,
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { id: number; status: string; submitterId: string }[];
      };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: ticketIds.ownCompleted,
        status: 'completed',
        submitterId: EMPLOYEE_ONE,
      });
    });

    it('gives a handler the whole queue', async () => {
      const response = await request('/it-tickets', { user: HANDLER });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { id: number }[];
        meta: { canProcess: boolean };
      };
      expect(body.meta.canProcess).toBe(true);
      expect(body.data).toHaveLength(4);
    });

    it('treats an unrestricted administrator as a handler', async () => {
      const response = await request('/it-tickets?status=pending', {
        user: ADMIN,
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { id: number }[];
        meta: { canProcess: boolean };
      };
      expect(body.meta.canProcess).toBe(true);
      expect(body.data.map((ticket) => ticket.id).sort()).toEqual(
        [ticketIds.own, ticketIds.otherPending].sort(),
      );
    });

    it('rejects an unknown status filter', async () => {
      const response = await request('/it-tickets?status=closed', {
        user: HANDLER,
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: 'IT_TICKET_INVALID_STATUS',
      });
    });

    it('resolves the names of the people involved', async () => {
      const response = await request('/it-tickets', { user: HANDLER });
      const body = (await response.json()) as {
        data: {
          id: number;
          submitterName: string;
          handlerName: string | null;
        }[];
      };
      const own = body.data.find((ticket) => ticket.id === ticketIds.own);
      expect(own?.submitterName).toBe('Employee One');
      const inProgress = body.data.find(
        (ticket) => ticket.id === ticketIds.otherInProgress,
      );
      expect(inProgress?.handlerName).toBe('Handler');
    });
  });

  describe('creating', () => {
    it('lets an employee submit a pending ticket as themselves', async () => {
      const response = await request('/it-tickets', {
        user: EMPLOYEE_ONE,
        method: 'POST',
        body: {
          title: 'The printer is out of toner',
          category: 'computer',
          description: 'Second floor, near the window.',
        },
      });
      expect(response.status).toBe(201);
      const body = (await response.json()) as {
        data: {
          id: number;
          title: string;
          status: string;
          submitterId: string;
          submitterName: string;
        };
      };
      expect(body.data).toMatchObject({
        title: 'The printer is out of toner',
        status: 'pending',
        submitterId: EMPLOYEE_ONE,
        submitterName: 'Employee One',
      });

      // It is now visible to its submitter …
      const mine = await request('/it-tickets', { user: EMPLOYEE_ONE });
      expect(((await mine.json()) as { data: unknown[] }).data).toHaveLength(3);
      // … and to a handler, but not to another employee.
      const others = await request('/it-tickets', { user: EMPLOYEE_TWO });
      expect(((await others.json()) as { data: unknown[] }).data).toHaveLength(
        2,
      );
    });

    it('rejects a ticket without a title', async () => {
      const response = await request('/it-tickets', {
        user: EMPLOYEE_ONE,
        method: 'POST',
        body: { title: '   ', category: 'other' },
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: 'IT_TICKET_TITLE_REQUIRED',
      });
    });

    it('rejects an unknown category', async () => {
      const response = await request('/it-tickets', {
        user: EMPLOYEE_ONE,
        method: 'POST',
        body: { title: 'Something', category: 'printer' },
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: 'IT_TICKET_INVALID_CATEGORY',
      });
    });
  });

  describe('reading one ticket', () => {
    it('lets an employee read their own ticket', async () => {
      const response = await request(`/it-tickets/${ticketIds.own}`, {
        user: EMPLOYEE_ONE,
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { id: number };
        meta: { canProcess: boolean };
      };
      expect(body.data.id).toBe(ticketIds.own);
      expect(body.meta.canProcess).toBe(false);
    });

    it('refuses an employee somebody else’s ticket', async () => {
      const response = await request(`/it-tickets/${ticketIds.otherPending}`, {
        user: EMPLOYEE_ONE,
      });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: 'IT_TICKET_FORBIDDEN',
      });
    });

    it('answers 404 for a ticket nobody has', async () => {
      const response = await request('/it-tickets/9999', { user: HANDLER });
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        code: 'IT_TICKET_NOT_FOUND',
      });
    });

    it('rejects a malformed identifier', async () => {
      const response = await request('/it-tickets/abc', { user: HANDLER });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: 'IT_TICKET_INVALID_ID',
      });
    });
  });

  describe('processing', () => {
    it('lets a handler take a pending ticket and record the resolution', async () => {
      const started = await request(`/it-tickets/${ticketIds.own}/start`, {
        user: HANDLER,
        method: 'POST',
      });
      expect(started.status).toBe(200);
      const startedBody = (await started.json()) as {
        data: { status: string; handlerId: string; handlerName: string };
      };
      expect(startedBody.data).toMatchObject({
        status: 'in-progress',
        handlerId: HANDLER,
        handlerName: 'Handler',
      });

      const completed = await request(`/it-tickets/${ticketIds.own}/complete`, {
        user: HANDLER,
        method: 'POST',
        body: { resolutionNote: 'Replaced the network cable.' },
      });
      expect(completed.status).toBe(200);
      const completedBody = (await completed.json()) as {
        data: { status: string; resolutionNote: string };
      };
      expect(completedBody.data).toMatchObject({
        status: 'completed',
        resolutionNote: 'Replaced the network cable.',
      });

      // The completion is durable: a fresh read returns the same record.
      const reread = await request(`/it-tickets/${ticketIds.own}`, {
        user: HANDLER,
      });
      const rereadBody = (await reread.json()) as {
        data: { status: string; resolutionNote: string };
      };
      expect(rereadBody.data).toMatchObject({
        status: 'completed',
        resolutionNote: 'Replaced the network cable.',
      });
    });

    it('refuses an employee starting or completing a ticket', async () => {
      const start = await request(`/it-tickets/${ticketIds.own}/start`, {
        user: EMPLOYEE_ONE,
        method: 'POST',
      });
      expect(start.status).toBe(403);
      const complete = await request(`/it-tickets/${ticketIds.own}/complete`, {
        user: EMPLOYEE_ONE,
        method: 'POST',
        body: { resolutionNote: 'Handled it.' },
      });
      expect(complete.status).toBe(403);
    });

    it('refuses to start a ticket that is already being handled', async () => {
      const response = await request(
        `/it-tickets/${ticketIds.otherInProgress}/start`,
        { user: HANDLER, method: 'POST' },
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: 'IT_TICKET_INVALID_STATE',
      });
    });

    it('refuses to complete a ticket that is already done', async () => {
      const response = await request(
        `/it-tickets/${ticketIds.ownCompleted}/complete`,
        { user: HANDLER, method: 'POST', body: { resolutionNote: 'Again.' } },
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: 'IT_TICKET_INVALID_STATE',
      });
    });

    it('answers 404 for processing a ticket nobody has', async () => {
      const response = await request('/it-tickets/9999/start', {
        user: HANDLER,
        method: 'POST',
      });
      expect(response.status).toBe(404);
    });
  });
});

describe('resolveItTicketRole', () => {
  it('recognizes only the handler set and unrestricted identities', async () => {
    const permissionSets = {
      unrestricted: async ({ principal }) => principal.id === ADMIN,
      getEffective: async ({ principal }) =>
        principal.id === HANDLER
          ? [{ key: IT_TICKET_HANDLER_SET, grants: [] }]
          : [],
    } as ItTicketRoleReader;

    await expect(resolveItTicketRole(permissionSets, HANDLER)).resolves.toBe(
      'handler',
    );
    await expect(resolveItTicketRole(permissionSets, ADMIN)).resolves.toBe(
      'handler',
    );
    await expect(
      resolveItTicketRole(permissionSets, EMPLOYEE_ONE),
    ).resolves.toBe('employee');
  });
});

async function seedIdentity(context: ItTicketTestDatabase): Promise<void> {
  const users = [
    { id: HANDLER, name: 'Handler', username: 'test-handler' },
    { id: EMPLOYEE_ONE, name: 'Employee One', username: 'test-employee-1' },
    { id: EMPLOYEE_TWO, name: 'Employee Two', username: 'test-employee-2' },
    { id: ADMIN, name: 'Administrator', username: 'test-admin' },
  ];
  await context.query
    .insertInto('user')
    .values(
      users.map((user) => ({
        ...user,
        email: `${user.username}@example.com`,
        emailVerified: true,
        createdAt: SEED_AT,
        updatedAt: SEED_AT,
      })),
    )
    .execute();
}

async function seedTickets(
  context: ItTicketTestDatabase,
): Promise<
  Record<'own' | 'otherInProgress' | 'ownCompleted' | 'otherPending', number>
> {
  const tickets = [
    {
      key: 'own',
      title: 'Laptop will not boot',
      category: 'computer',
      description: 'It shows a black screen.',
      submitterId: EMPLOYEE_ONE,
      handlerId: null,
      status: 'pending',
      resolutionNote: null,
    },
    {
      key: 'otherInProgress',
      title: 'Cannot sign in to the CRM',
      category: 'account',
      description: null,
      submitterId: EMPLOYEE_TWO,
      handlerId: HANDLER,
      status: 'in-progress',
      resolutionNote: null,
    },
    {
      key: 'ownCompleted',
      title: 'Install the design software',
      category: 'computer',
      description: null,
      submitterId: EMPLOYEE_ONE,
      handlerId: HANDLER,
      status: 'completed',
      resolutionNote: 'Installed and licensed.',
    },
    {
      key: 'otherPending',
      title: 'Request a new keyboard',
      category: 'other',
      description: null,
      submitterId: EMPLOYEE_TWO,
      handlerId: null,
      status: 'pending',
      resolutionNote: null,
    },
  ] as const;

  const ids = {} as Record<
    'own' | 'otherInProgress' | 'ownCompleted' | 'otherPending',
    number
  >;
  for (const ticket of tickets) {
    const { key, ...values } = ticket;
    const result = await context.query
      .insertInto('itTickets')
      .values({ ...values, createdAt: SEED_AT, updatedAt: SEED_AT })
      .execute();
    ids[key] = Number(result.insertId);
  }
  return ids;
}
