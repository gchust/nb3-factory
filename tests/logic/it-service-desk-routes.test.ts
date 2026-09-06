import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  AssigneeNotFoundError,
  InvalidStatusTransitionError,
  itTicketServiceToken,
  TicketNotFoundError,
  type ItTicketService,
  type ItTicketView,
} from '../../server/providers/index.js';
import { apiRoutes } from '../../server/routes/it-service-desk.js';

interface TestAuthEnv {
  Variables: {
    auth: {
      user: { id: string; name?: string; email?: string };
      session: unknown;
    } | null;
  };
}

/** A stand-in for the authentication plugin's Auth that only implements `required()`. */
function createFakeAuth(
  getUser: () => { id: string; name?: string; email?: string } | null,
): Auth {
  const required: MiddlewareHandler<TestAuthEnv> = async (context, next) => {
    const user = getUser();
    if (!user) {
      return context.json(
        { code: 'UNAUTHORIZED', message: 'Sign in required.' },
        401,
      );
    }
    context.set('auth', { user, session: null });
    await next();
  };
  return { required: () => required } as unknown as Auth;
}

function createFakeService(): ItTicketService {
  return {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    assigneeCandidates: vi.fn(),
  } as unknown as ItTicketService;
}

function buildApp(service: ItTicketService, auth: Auth) {
  const container = new ServiceContainer();
  container.instance(authenticationToken, auth);
  container.instance(itTicketServiceToken, service);
  return apiRoutes.createRouter({ container } as unknown as Application);
}

const sampleTicket: ItTicketView = {
  id: 1,
  title: 'Laptop will not boot',
  description: 'Black screen after update.',
  category: 'hardware',
  priority: 'urgent',
  status: 'inProgress',
  requesterId: 'user-1',
  assigneeId: 'user-2',
  resolution: null,
  createdAt: '2026-08-28T02:00:00.000Z',
  updatedAt: '2026-08-28T06:30:00.000Z',
  requesterName: 'Fang Wang',
  assigneeName: 'Wei Zhang',
};

describe('it-service-desk API routes', () => {
  it('rejects unauthenticated requests', async () => {
    const service = createFakeService();
    const app = buildApp(
      service,
      createFakeAuth(() => null),
    );

    const response = await app.request('/it-service-desk/tickets');
    expect(response.status).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('lists tickets with parsed filters', async () => {
    const service = createFakeService();
    vi.mocked(service.list).mockResolvedValue({
      items: [sampleTicket],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1', name: 'Wei Zhang' })),
    );

    const response = await app.request(
      '/it-service-desk/tickets?status=pending&priority=high&page=2&pageSize=10',
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: ItTicketView[];
      meta: { total: number; page: number; pageSize: number };
    };
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ total: 1, page: 1, pageSize: 20 });
    expect(service.list).toHaveBeenCalledWith({
      status: 'pending',
      priority: 'high',
      page: 2,
      pageSize: 10,
    });
  });

  it('rejects an unknown filter value', async () => {
    const service = createFakeService();
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1' })),
    );

    const response = await app.request(
      '/it-service-desk/tickets?status=not-a-status',
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('INVALID_FILTER');
    expect(service.list).not.toHaveBeenCalled();
  });

  it('returns a single ticket', async () => {
    const service = createFakeService();
    vi.mocked(service.getById).mockResolvedValue(sampleTicket);
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1' })),
    );

    const response = await app.request('/it-service-desk/tickets/1');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: ItTicketView };
    expect(body.data.id).toBe(1);
    expect(service.getById).toHaveBeenCalledWith(1);
  });

  it('rejects a non-numeric ticket id', async () => {
    const service = createFakeService();
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1' })),
    );

    const response = await app.request('/it-service-desk/tickets/abc');
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('INVALID_ID');
    expect(service.getById).not.toHaveBeenCalled();
  });

  it('maps a missing ticket to 404', async () => {
    const service = createFakeService();
    vi.mocked(service.getById).mockRejectedValue(new TicketNotFoundError(999));
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1' })),
    );

    const response = await app.request('/it-service-desk/tickets/999');
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('NOT_FOUND');
  });

  it('creates a ticket for the signed-in requester', async () => {
    const service = createFakeService();
    vi.mocked(service.create).mockResolvedValue(sampleTicket);
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1', name: 'Wei Zhang' })),
    );

    const response = await app.request('/it-service-desk/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '  New keyboard needed  ',
        description: 'Dead keys.',
        category: 'hardware',
        priority: 'normal',
      }),
    });
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(
      {
        title: 'New keyboard needed',
        description: 'Dead keys.',
        category: 'hardware',
        priority: 'normal',
      },
      'user-1',
    );
  });

  it('rejects a create without title or description', async () => {
    const service = createFakeService();
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1' })),
    );

    const response = await app.request('/it-service-desk/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'hardware', priority: 'normal' }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('rejects a create with an invalid category', async () => {
    const service = createFakeService();
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1' })),
    );

    const response = await app.request('/it-service-desk/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Something',
        description: 'Something else',
        category: 'bogus',
        priority: 'normal',
      }),
    });
    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('updates a ticket', async () => {
    const service = createFakeService();
    vi.mocked(service.update).mockResolvedValue({
      ...sampleTicket,
      status: 'resolved',
      resolution: 'Fixed.',
    });
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1' })),
    );

    const response = await app.request('/it-service-desk/tickets/1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', resolution: 'Fixed.' }),
    });
    expect(response.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(1, {
      status: 'resolved',
      resolution: 'Fixed.',
    });
  });

  it('maps an invalid status transition to 400', async () => {
    const service = createFakeService();
    vi.mocked(service.update).mockRejectedValue(
      new InvalidStatusTransitionError('pending', 'resolved'),
    );
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1' })),
    );

    const response = await app.request('/it-service-desk/tickets/1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('maps an unknown assignee to 400', async () => {
    const service = createFakeService();
    vi.mocked(service.update).mockRejectedValue(
      new AssigneeNotFoundError('no-such-user'),
    );
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1' })),
    );

    const response = await app.request('/it-service-desk/tickets/1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assigneeId: 'no-such-user' }),
    });
    expect(response.status).toBe(400);
  });

  it('rejects an unknown update field', async () => {
    const service = createFakeService();
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1' })),
    );

    const response = await app.request('/it-service-desk/tickets/1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    });
    expect(response.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('lists assignee candidates', async () => {
    const service = createFakeService();
    vi.mocked(service.assigneeCandidates).mockResolvedValue([
      { id: 'user-1', name: 'Wei Zhang', email: 'zhang.wei@example.com' },
    ]);
    const app = buildApp(
      service,
      createFakeAuth(() => ({ id: 'user-1' })),
    );

    const response = await app.request('/it-service-desk/tickets/staff');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });
});
