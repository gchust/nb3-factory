// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationContext,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AuthorizationDecision } from '@nocobase/authorization/core';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Context, Next } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { ticketServiceToken } from '../../server/tickets/provider.js';
import { ticketRoutes } from '../../server/tickets/routes.js';
import {
  TicketStateError,
  type TicketService,
  type TicketView,
} from '../../server/tickets/service.js';

const PRINCIPAL_ID = 'user-1';

function ticket(overrides: Partial<TicketView> = {}): TicketView {
  return {
    id: 1,
    title: 'Laptop will not start',
    category: 'computer',
    description: null,
    status: 'pending',
    resolution: null,
    submitterId: PRINCIPAL_ID,
    handlerId: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    handledAt: null,
    submitterName: 'Employee One',
    handlerName: null,
    ...overrides,
  };
}

function createService(): TicketService {
  return {
    list: vi.fn(async () => [ticket()]),
    get: vi.fn(async () => ticket()),
    create: vi.fn(async () => ticket()),
    start: vi.fn(async () => ticket({ status: 'in_progress' })),
    complete: vi.fn(async () => ticket({ status: 'completed' })),
  };
}

interface HarnessOptions {
  readonly authenticated?: boolean;
  readonly decision?: AuthorizationDecision;
  readonly service?: TicketService;
}

/**
 * Builds the production route factory with its dependencies supplied as test
 * doubles, so the real middleware chain and handlers are what the requests hit.
 */
function createHarness(options: HarnessOptions = {}) {
  const authenticated = options.authenticated ?? true;
  const decision: AuthorizationDecision = options.decision ?? {
    effect: 'permit',
    reasons: [],
  };
  const service = options.service ?? createService();

  const container = new ServiceContainer();
  container.instance(ticketServiceToken, service);
  container.instance(authenticationToken, {
    required:
      () =>
      async (context: Context, next: Next): Promise<Response | void> => {
        if (!authenticated) {
          return context.json({ code: 'UNAUTHORIZED' }, 401);
        }
        await next();
      },
  } as never);
  container.instance(authorizationToken, {
    middleware:
      () =>
      async (context: Context, next: Next): Promise<void> => {
        context.set('authz', {
          identity: { principal: { type: 'user', id: PRINCIPAL_ID } },
          authorize: async () => decision,
        } as unknown as AuthorizationContext);
        await next();
      },
  } as unknown as AppAuthorization);

  const app = { container } as unknown as Application;
  return { router: ticketRoutes.createRouter(app), service };
}

describe('ticket routes', () => {
  it('rejects an anonymous request with 401', async () => {
    const { router, service } = createHarness({ authenticated: false });
    const response = await router.request('/tickets');
    expect(response.status).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('rejects an authenticated but unpermitted request with 403', async () => {
    const { router, service } = createHarness({
      decision: { effect: 'deny', reasons: [] },
    });
    const response = await router.request('/tickets');
    expect(response.status).toBe(403);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('answers a permitted request with the records', async () => {
    const { router, service } = createHarness();
    const response = await router.request('/tickets');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [ticket()] });
    // A `permit` decision carries no conditions, so the service runs unrestricted.
    expect(service.list).toHaveBeenCalledWith(undefined, {});
  });

  it('passes a conditional decision through as a Repository policy', async () => {
    const policy = { read: { submitterId: PRINCIPAL_ID } };
    const { router, service } = createHarness({
      decision: {
        effect: 'conditional',
        conditions: { type: 'composite', database: { tickets: policy } },
        reasons: [],
      },
    });
    const response = await router.request('/tickets?status=pending');
    expect(response.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(policy, { status: 'pending' });
  });

  it('rejects an unknown status filter with 422', async () => {
    const { router } = createHarness();
    const response = await router.request('/tickets?status=archived');
    expect(response.status).toBe(422);
  });

  it('answers 404 for a record outside the caller scope', async () => {
    const service = createService();
    vi.mocked(service.get).mockResolvedValue(undefined);
    const { router } = createHarness({ service });
    const response = await router.request('/tickets/9');
    expect(response.status).toBe(404);
  });

  it('rejects an invalid submission with 422', async () => {
    const { router, service } = createHarness();
    const response = await router.request('/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '', category: 'printer' }),
    });
    expect(response.status).toBe(422);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('records the signed-in user as the submitter', async () => {
    const { router, service } = createHarness();
    const response = await router.request('/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Printer is out of ink',
        category: 'other',
      }),
    });
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(
      undefined,
      { title: 'Printer is out of ink', category: 'other', description: null },
      PRINCIPAL_ID,
    );
  });

  it('answers 409 when a ticket cannot change state', async () => {
    const service = createService();
    vi.mocked(service.start).mockRejectedValue(
      new TicketStateError('Already handled.', 'TICKET_STATE_CONFLICT'),
    );
    const { router } = createHarness({ service });
    const response = await router.request('/tickets/1/start', {
      method: 'POST',
    });
    expect(response.status).toBe(409);
  });
});
