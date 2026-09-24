// @vitest-environment node
import type { Auth } from '@nocobase/app-plugin-authentication';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppAuthorizationService } from '@nocobase/app-plugin-authorization';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { RepositoryPolicy } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SERVICE_REQUEST_COLLECTION,
  serviceRequestServiceToken,
  type CreateServiceRequestInput,
  type ServiceRequestAssignee,
  type ServiceRequestService,
} from '../../server/providers/service-request.js';
import { apiRoutes } from '../../server/routes/service-requests.js';
import type { ServiceRequestRecord } from '../../server/service-request-model.js';

/**
 * The route tests drive the production contribution (`apiRoutes.createRouter`)
 * with resolved doubles in a real container, so dependency resolution and both
 * middleware — the session and the authorization check — are part of what is
 * exercised, not stubbed away.
 */

interface TestScope {
  readonly mode: 'full' | 'denied';
}

function makeRecord(
  overrides: Partial<ServiceRequestRecord> = {},
): ServiceRequestRecord {
  return {
    id: 1,
    title: 'Printer on the third floor is broken',
    urgent: true,
    assigneeId: 'user-2',
    status: 'pending',
    result: null,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    ...overrides,
  };
}

interface Harness {
  readonly app: Application;
  readonly service: ServiceRequestService & {
    accept: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
}

function createHarness(): Harness {
  const auth: Auth = {
    // Anonymous callers never carry the session header, so the route is reached
    // only with a session and the authorization check gets a scope to resolve.
    required: () => async (context: any, next: any) => {
      if (context.req.header('x-test-session') !== 'yes') {
        return context.json({ code: 'UNAUTHORIZED' }, 401);
      }
      context.set('authz', {
        mode: context.req.header('x-test-scope') ?? 'full',
      });
      await next();
    },
  } as unknown as Auth;

  const authorization = {
    middleware: () => async (_context: any, next: any) => {
      await next();
    },
    db: {
      policyFor: async (_collection: string, scope: TestScope) =>
        scope.mode === 'denied'
          ? { read: false, create: false, update: false, delete: false }
          : {
              read: { scope: { type: 'all' } },
              create: { scope: { type: 'all' } },
              update: { scope: { type: 'all' } },
              delete: false,
            },
    },
  } as unknown as AppAuthorizationService;

  const records: ServiceRequestRecord[] = [makeRecord()];
  const service = {
    list: vi.fn(async () => records),
    get: vi.fn(
      async (_policy: RepositoryPolicy<ServiceRequestRecord>, id: number) =>
        records.find((record) => record.id === id),
    ),
    create: vi.fn(
      async (
        _policy: RepositoryPolicy<ServiceRequestRecord>,
        input: CreateServiceRequestInput,
      ) =>
        makeRecord({
          id: 2,
          title: input.title,
          urgent: input.urgent,
          assigneeId: input.assigneeId,
          status: 'pending',
        }),
    ),
    listAssignees: vi.fn(async (): Promise<ServiceRequestAssignee[]> => [
      { id: 'user-2', name: 'Request Assignee', email: 'assignee@example.com' },
    ]),
    accept: vi.fn(async (_id: number, _options: { locale: string }) => ({
      runId: '1',
    })),
  };

  const container = new ServiceContainer();
  container.instance(authenticationToken, auth);
  container.instance(authorizationToken, authorization);
  container.instance(serviceRequestServiceToken, service);

  const app = {
    container,
    config: { get: () => undefined },
  } as unknown as Application;

  return { app, service: service as Harness['service'] };
}

async function createRouter(app: Application): Promise<Hono> {
  const router = await apiRoutes.createRouter(app);
  return router;
}

function request(
  router: Hono,
  path: string,
  init: RequestInit & { session?: boolean; scope?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.session !== false) headers.set('x-test-session', 'yes');
  if (init.scope) headers.set('x-test-scope', init.scope);
  return router.request(path, { ...init, headers });
}

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

describe('service request routes', () => {
  it('rejects an anonymous caller with 401', async () => {
    const router = await createRouter(harness.app);
    const response = await request(router, '/service-requests', {
      session: false,
    });
    expect(response.status).toBe(401);
  });

  it('rejects an authenticated caller without the read grant with 403', async () => {
    const router = await createRouter(harness.app);
    const response = await request(router, '/service-requests', {
      scope: 'denied',
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lists requests for a permitted caller', async () => {
    const router = await createRouter(harness.app);
    const response = await request(router, '/service-requests');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [{ id: 1 }] });
  });

  it('exposes assignee options behind the same read grant', async () => {
    const router = await createRouter(harness.app);
    const permitted = await request(router, '/service-requests/assignees');
    expect(permitted.status).toBe(200);
    expect(await permitted.json()).toMatchObject({
      data: [{ id: 'user-2' }],
    });

    const denied = await request(router, '/service-requests/assignees', {
      scope: 'denied',
    });
    expect(denied.status).toBe(403);
  });

  it('creates a request from a whitelisted body', async () => {
    const router = await createRouter(harness.app);
    const response = await request(router, '/service-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '  Update the shared team mailbox  ',
        urgent: false,
        assigneeId: 'user-2',
        // A field the route does not whitelist must not reach the service.
        status: 'accepted_urgent',
      }),
    });
    expect(response.status).toBe(201);
    expect(harness.service.create).toHaveBeenCalledWith(expect.anything(), {
      title: '  Update the shared team mailbox  ',
      urgent: false,
      assigneeId: 'user-2',
    });
  });

  it('rejects a malformed create body with 400', async () => {
    const router = await createRouter(harness.app);
    const response = await request(router, '/service-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 7 }),
    });
    expect(response.status).toBe(400);
    expect(harness.service.create).not.toHaveBeenCalled();
  });

  it('runs the acceptance workflow for a permitted caller', async () => {
    const router = await createRouter(harness.app);
    const response = await request(router, '/service-requests/1/accept', {
      method: 'POST',
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      data: { runId: '1' },
    });
    expect(harness.service.accept).toHaveBeenCalledWith(1, {
      locale: 'en-US',
    });
  });

  it('denies acceptance to a caller without the update grant', async () => {
    const router = await createRouter(harness.app);
    const response = await request(router, '/service-requests/1/accept', {
      method: 'POST',
      scope: 'denied',
    });
    expect(response.status).toBe(403);
    expect(harness.service.accept).not.toHaveBeenCalled();
  });
});

describe('service request route collection registration', () => {
  it('reads and writes the collection the feature owns', async () => {
    expect(SERVICE_REQUEST_COLLECTION).toBe('serviceRequests');
  });
});
