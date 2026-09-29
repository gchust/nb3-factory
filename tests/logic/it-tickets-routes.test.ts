// @vitest-environment node

import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type {
  AuthEnv,
  AuthSession,
} from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type {
  AuthorizationContext,
  AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  ItTicketError,
  type ItTicketView,
} from '../../server/it-tickets/domain.js';
import {
  itTicketServiceToken,
  type ItTicketService,
} from '../../server/it-tickets/service.js';
import { itTicketApiRoutes } from '../../server/routes/it-tickets.js';

type TestEnv = AuthEnv & AuthorizationEnv;

const TICKET: ItTicketView = {
  id: 'ticket-1',
  title: 'Screen stays black',
  category: 'computer',
  description: 'The screen stays black after waking up.',
  status: 'pending',
  ownerId: 'user-1',
  handlerId: null,
  resolution: null,
  startedAt: null,
  completedAt: null,
  createdAt: new Date('2026-01-05T01:00:00.000Z'),
  updatedAt: new Date('2026-01-05T01:00:00.000Z'),
  ownerName: 'Li Jing',
  handlerName: null,
};

/** A service stub whose methods resolve or reject per test, so the route is tested on its own. */
function stubService(
  overrides: Partial<ItTicketService> = {},
): ItTicketService {
  return {
    list: vi.fn(async () => [TICKET]),
    detail: vi.fn(async () => TICKET),
    create: vi.fn(async () => TICKET),
    start: vi.fn(async () => ({ ...TICKET, status: 'in_progress' as const })),
    complete: vi.fn(async () => ({ ...TICKET, status: 'completed' as const })),
    ...overrides,
  };
}

interface HarnessOptions {
  readonly authenticated?: boolean;
  readonly service?: ItTicketService;
}

async function createHarness(options: HarnessOptions = {}): Promise<Hono> {
  const authenticated = options.authenticated ?? true;
  const service = options.service ?? stubService();

  const auth = {
    required: (): MiddlewareHandler<TestEnv> => async (context, next) => {
      if (!authenticated) {
        return context.json({ message: 'Unauthorized' }, 401);
      }
      context.set('auth', {
        user: { id: 'user-1' },
        session: { id: 'session-1' },
      } as unknown as AuthSession);
      await next();
    },
  };
  const authorization = {
    middleware: (): MiddlewareHandler<TestEnv> => async (context, next) => {
      context.set('authz', {
        identity: { principal: { type: 'user', id: 'user-1' } },
      } as unknown as AuthorizationContext);
      await next();
    },
  };

  const knownTokens = [
    authenticationToken,
    authorizationToken,
    itTicketServiceToken,
  ];
  const application = {
    container: {
      has: (token: unknown): boolean => knownTokens.includes(token as never),
      resolve: (token: unknown): unknown => {
        if (token === authenticationToken) return auth;
        if (token === authorizationToken) return authorization;
        if (token === itTicketServiceToken) return service;
        throw new Error('Unexpected service token in test.');
      },
    },
  } as unknown as Application;

  const router = await itTicketApiRoutes.createRouter(application);
  const root = new Hono();
  root.route('/api', router);
  return root;
}

describe('IT ticket routes', () => {
  it('rejects an anonymous request with 401', async () => {
    const app = await createHarness({ authenticated: false });
    const response = await app.request('/api/it-tickets');
    expect(response.status).toBe(401);
  });

  it('rejects a request whose service denies the operation with 403', async () => {
    const service = stubService({
      list: vi.fn(async () => {
        throw new ItTicketError('FORBIDDEN', 'Not permitted.');
      }),
    });
    const app = await createHarness({ service });
    const response = await app.request('/api/it-tickets');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: 'FORBIDDEN',
      message: 'Not permitted.',
    });
  });

  it('lists the permitted tickets and forwards the status filter', async () => {
    const list = vi.fn(async () => [TICKET]);
    const app = await createHarness({ service: stubService({ list }) });
    const response = await app.request('/api/it-tickets?status=pending');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: readonly ItTicketView[];
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 'ticket-1',
      title: 'Screen stays black',
      status: 'pending',
      ownerName: 'Li Jing',
    });
    expect(list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'pending' }),
    );
  });

  it('answers 404 for a ticket the caller may not see', async () => {
    const service = stubService({
      detail: vi.fn(async () => {
        throw new ItTicketError('NOT_FOUND', 'No such ticket.');
      }),
    });
    const app = await createHarness({ service });
    const response = await app.request('/api/it-tickets/others-ticket');
    expect(response.status).toBe(404);
  });

  it('creates a ticket with 201 and forwards the input fields', async () => {
    const create = vi.fn(async () => TICKET);
    const app = await createHarness({ service: stubService({ create }) });
    const response = await app.request('/api/it-tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Screen stays black',
        category: 'computer',
        description: 'The screen stays black after waking up.',
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: ItTicketView };
    expect(body.data).toMatchObject({ id: 'ticket-1', status: 'pending' });
    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Screen stays black' }),
    );
  });

  it('answers 400 when the service rejects an invalid create body', async () => {
    const service = stubService({
      create: vi.fn(async () => {
        throw new ItTicketError('INVALID_CATEGORY', 'Bad category.');
      }),
    });
    const app = await createHarness({ service });
    const response = await app.request('/api/it-tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'x',
        category: 'network',
        description: 'y',
      }),
    });
    expect(response.status).toBe(400);
  });

  it('answers 400 instead of 500 for a malformed JSON body', async () => {
    const app = await createHarness();
    const response = await app.request('/api/it-tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(response.status).toBe(400);
  });

  it('starts a pending ticket', async () => {
    const start = vi.fn(async () => ({
      ...TICKET,
      status: 'in_progress' as const,
    }));
    const app = await createHarness({ service: stubService({ start }) });
    const response = await app.request('/api/it-tickets/ticket-1/start', {
      method: 'POST',
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: ItTicketView };
    expect(body.data.status).toBe('in_progress');
    expect(start).toHaveBeenCalledWith(expect.anything(), 'ticket-1');
  });

  it('answers 409 when a completed ticket is started again', async () => {
    const service = stubService({
      start: vi.fn(async () => {
        throw new ItTicketError('TICKET_COMPLETED', 'Already completed.');
      }),
    });
    const app = await createHarness({ service });
    const response = await app.request('/api/it-tickets/ticket-1/start', {
      method: 'POST',
    });
    expect(response.status).toBe(409);
  });

  it('answers 409 when a ticket is completed from the wrong status', async () => {
    const service = stubService({
      complete: vi.fn(async () => {
        throw new ItTicketError('INVALID_TRANSITION', 'Not in progress.');
      }),
    });
    const app = await createHarness({ service });
    const response = await app.request('/api/it-tickets/ticket-1/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolution: 'done' }),
    });
    expect(response.status).toBe(409);
  });

  it('completes an in-progress ticket and forwards the handling note', async () => {
    const complete = vi.fn(async () => ({
      ...TICKET,
      status: 'completed' as const,
      resolution: 'Replaced the cable.',
    }));
    const app = await createHarness({ service: stubService({ complete }) });
    const response = await app.request('/api/it-tickets/ticket-1/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolution: 'Replaced the cable.' }),
    });
    expect(response.status).toBe(200);
    expect(complete).toHaveBeenCalledWith(
      expect.anything(),
      'ticket-1',
      'Replaced the cable.',
    );
  });
});
