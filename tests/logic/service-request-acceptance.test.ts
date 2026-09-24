// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { Hono, type Context, type Next } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import {
  authenticationToken,
  type AdministratedUser,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication';
import type {
  WorkflowRunOptions,
  WorkflowRunServices,
} from '@nocobase/app-plugin-workflow';
import type { WorkflowServiceContract } from '@nocobase/app-plugin-workflow/server';

import workflow from '../../server/workflows/service-request-acceptance/workflow.js';
import { run as registerAcceptance } from '../../server/workflows/service-request-acceptance/server/register-acceptance.js';
import { run as markUrgent } from '../../server/workflows/service-request-acceptance/server/mark-urgent.js';
import { run as markNormal } from '../../server/workflows/service-request-acceptance/server/mark-normal.js';
import { run as notifyAssignee } from '../../server/workflows/service-request-acceptance/server/notify-assignee.js';
import { serviceRequestApiRoutes } from '../../server/routes/service-requests.js';
import {
  SERVICE_REQUEST_WORKFLOW_KEY,
  type WorkflowGate,
} from '../../server/providers/workflow-gate.js';
import {
  createServiceRequestsService,
  serviceRequestsServiceToken,
  ServiceRequestError,
  type ServiceRequestAcceptOutcome,
  type ServiceRequestAssignee,
  type ServiceRequestsDependencies,
  type ServiceRequestView,
  type ServiceRequestsService,
} from '../../server/providers/index.js';

type FakeRow = Record<string, unknown>;

/**
 * Minimal in-memory repository good enough for the plain equality filters and
 * mutations the workflow run modules and the service use.
 */
class FakeRepository {
  public readonly rows: FakeRow[] = [];
  private nextId = 1;

  private matches(row: FakeRow, filter?: FakeRow): boolean {
    if (!filter) {
      return true;
    }
    return Object.entries(filter).every(([key, value]) => row[key] === value);
  }

  findOne(options?: { filter?: FakeRow }): FakeRow | undefined {
    return this.rows.find((row) => this.matches(row, options?.filter));
  }

  findMany(): FakeRow[] {
    return [...this.rows];
  }

  createOne(options: { values: FakeRow }): { record: FakeRow } {
    const record: FakeRow = { id: this.nextId, ...options.values };
    this.nextId += 1;
    this.rows.push(record);
    return { record };
  }

  updateMany(options: { filter?: FakeRow; values: FakeRow }): {
    updatedCount: number;
  } {
    let updatedCount = 0;
    for (let index = 0; index < this.rows.length; index += 1) {
      if (this.matches(this.rows[index], options.filter)) {
        this.rows[index] = { ...this.rows[index], ...options.values };
        updatedCount += 1;
      }
    }
    return { updatedCount };
  }
}

function createFakeDatabase(): {
  database: DatabaseManager;
  requests: FakeRepository;
  runs: FakeRepository;
} {
  const requests = new FakeRepository();
  const runs = new FakeRepository();
  const database = {
    repository: (name: string): FakeRepository => {
      if (name === 'serviceRequests') {
        return requests;
      }
      if (name === 'workflowRuns') {
        return runs;
      }
      throw new Error(`Unexpected repository "${name}".`);
    },
  } as unknown as DatabaseManager;
  return { database, requests, runs };
}

function createRunOptions(
  services: ReadonlyMap<unknown, unknown>,
): WorkflowRunOptions {
  const runServices = {
    has: (token: unknown): boolean => services.has(token),
    resolve: (token: unknown): unknown => {
      if (!services.has(token)) {
        throw new Error('Service is not available.');
      }
      return services.get(token);
    },
  } as unknown as WorkflowRunServices;
  return {
    services: runServices,
    signal: new AbortController().signal,
    logger: {} as never,
  };
}

function requestRow(overrides: FakeRow = {}): FakeRow {
  const now = new Date('2026-03-01T00:00:00.000Z');
  return {
    id: 1,
    reference: 'REQ-2026-0001',
    title: 'Third-floor printer is offline',
    urgent: false,
    assigneeId: 'agent-1',
    status: 'pending',
    result: null,
    acceptedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function agentUser(
  overrides: Partial<AdministratedUser> = {},
): AdministratedUser {
  return {
    id: 'agent-1',
    name: 'Service Agent',
    username: 'agent',
    email: 'agent@example.com',
    emailVerified: true,
    disabledAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as AdministratedUser;
}

describe('service request acceptance workflow source', () => {
  it('registers the acceptance, urgency branch, and notification nodes', () => {
    expect(workflow.title).toBe('Service request acceptance');
    expect(workflow.inputSchema.required).toEqual(['requestId']);
    expect(workflow.nodes.map((node) => node.key)).toEqual([
      'registerAcceptance',
      'routeByUrgency',
      'notifyAssignee',
    ]);

    const branch = workflow.nodes.find((node) => node.key === 'routeByUrgency');
    expect(Object.keys(branch?.branches ?? {}).sort()).toEqual(['no', 'yes']);
    expect(branch?.branches?.yes.map((node) => node.key)).toEqual([
      'markUrgent',
    ]);
    expect(branch?.branches?.no.map((node) => node.key)).toEqual([
      'markNormal',
    ]);
  });
});

describe('register-acceptance run', () => {
  it('marks a pending request accepted and returns its routing values', async () => {
    const { database, requests } = createFakeDatabase();
    requests.rows.push(
      requestRow({ urgent: true, title: 'Production database alert' }),
    );
    const options = createRunOptions(
      new Map([[databaseManagerToken, database]]),
    );

    const result = await registerAcceptance({ requestId: '1' }, options);

    expect(result).toEqual({
      urgent: true,
      assigneeId: 'agent-1',
      title: 'Production database alert',
    });
    const stored = requests.findOne({ filter: { id: 1 } });
    expect(stored?.status).toBe('accepted');
    expect(stored?.acceptedAt).toBeInstanceOf(Date);
  });

  it('is a no-op for a request that is already accepted', async () => {
    const { database, requests } = createFakeDatabase();
    const acceptedAt = new Date('2026-02-01T00:00:00.000Z');
    requests.rows.push(requestRow({ status: 'accepted', acceptedAt }));
    const options = createRunOptions(
      new Map([[databaseManagerToken, database]]),
    );

    await registerAcceptance({ requestId: '1' }, options);

    const stored = requests.findOne({ filter: { id: 1 } });
    expect(stored?.acceptedAt).toBe(acceptedAt);
  });

  it('rejects a missing request id and an unknown request', async () => {
    const { database } = createFakeDatabase();
    const options = createRunOptions(
      new Map([[databaseManagerToken, database]]),
    );

    await expect(registerAcceptance({}, options)).rejects.toThrow(
      'requestId is required.',
    );
    await expect(
      registerAcceptance({ requestId: '999' }, options),
    ).rejects.toThrow('was not found.');
  });
});

describe('result branch runs', () => {
  it.each([
    ['urgent', markUrgent],
    ['normal', markNormal],
  ])(
    'records the %s result only on an accepted request',
    async (result, run) => {
      const { database, requests } = createFakeDatabase();
      requests.rows.push(
        requestRow({ id: 1, status: 'accepted' }),
        requestRow({ id: 2, status: 'pending' }),
      );
      const options = createRunOptions(
        new Map([[databaseManagerToken, database]]),
      );

      const returned = await run({ requestId: '1' }, options);

      expect(returned).toEqual({ result });
      expect(requests.findOne({ filter: { id: 1 } })?.result).toBe(result);
      expect(requests.findOne({ filter: { id: 2 } })?.result).toBeNull();
    },
  );
});

describe('notify-assignee run', () => {
  it('sends exactly one persistent in-app message targeting the request', async () => {
    const { database, requests } = createFakeDatabase();
    requests.rows.push(requestRow({ id: 5, urgent: true, result: 'urgent' }));
    const send = vi.fn().mockResolvedValue({
      notificationId: 'notification-1',
      idempotencyKey: 'service-request-accepted:5',
      deduplicated: false,
      status: 'completed',
      deliveries: [],
    });
    const options = createRunOptions(
      new Map([
        [databaseManagerToken, database],
        [notificationServiceToken, { send }],
      ]),
    );

    const result = await notifyAssignee({ requestId: '5' }, options);

    expect(result).toEqual({
      notificationId: 'notification-1',
      deduplicated: false,
    });
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload.idempotencyKey).toBe('service-request-accepted:5');
    expect(payload.messages.inbox).toMatchObject({
      to: 'agent-1',
      target: { type: 'route', path: '/service-requests/5' },
    });
    expect(payload.messages.inbox.title).toContain('REQ-2026-0001');
  });

  it('rejects an unknown request instead of notifying', async () => {
    const { database } = createFakeDatabase();
    const send = vi.fn();
    const options = createRunOptions(
      new Map([
        [databaseManagerToken, database],
        [notificationServiceToken, { send }],
      ]),
    );

    await expect(notifyAssignee({ requestId: '404' }, options)).rejects.toThrow(
      'was not found.',
    );
    expect(send).not.toHaveBeenCalled();
  });
});

function createFakeUsers(entries: AdministratedUser[] = []): {
  users: UserAdministrationService;
  entries: Map<string, AdministratedUser>;
} {
  const store = new Map(entries.map((entry) => [entry.id, entry]));
  const users = {
    get: (id: string): AdministratedUser | undefined => store.get(id),
    list: () => ({
      items: [...store.values()],
      total: store.size,
      page: 1,
      pageSize: 100,
    }),
  } as unknown as UserAdministrationService;
  return { users, entries: store };
}

describe('service requests service', () => {
  function build(overrides: {
    database: DatabaseManager;
    users: UserAdministrationService;
    gate?: WorkflowGate;
    trigger?: WorkflowServiceContract['trigger'];
  }): {
    service: ServiceRequestsService;
    dependencies: ServiceRequestsDependencies;
  } {
    const dependencies: ServiceRequestsDependencies = {
      database: overrides.database,
      users: overrides.users,
      workflowGate:
        overrides.gate ??
        ({
          ensureEnabled: async () => ({ enabled: true }),
        } as unknown as WorkflowGate),
      workflow: {
        registerInstruction: () => undefined,
        trigger:
          overrides.trigger ??
          (async () => ({ status: 'accepted', eventKey: 'e', runId: '1' })),
      } as unknown as WorkflowServiceContract,
    };
    return {
      service: createServiceRequestsService(dependencies),
      dependencies,
    };
  }

  it('creates a request with a reference one past the highest for the year', async () => {
    const { database, requests } = createFakeDatabase();
    const year = new Date().getFullYear();
    requests.rows.push(
      requestRow({ id: 1, reference: `REQ-${year}-0001` }),
      requestRow({ id: 2, reference: `REQ-${year}-0003` }),
      requestRow({ id: 3, reference: 'REQ-1999-0001' }),
    );
    const { users } = createFakeUsers([agentUser()]);
    const { service } = build({ database, users });

    const created = await service.create({
      title: '  A new request  ',
      urgent: true,
      assigneeId: 'agent-1',
    });

    expect(created).toMatchObject({
      title: 'A new request',
      urgent: true,
      assigneeId: 'agent-1',
      status: 'pending',
      reference: `REQ-${year}-0004`,
    });
  });

  it('validates the create input', async () => {
    const { database } = createFakeDatabase();
    const { users } = createFakeUsers([agentUser()]);
    const { service } = build({ database, users });

    await expect(
      service.create({ title: '   ', urgent: false, assigneeId: 'agent-1' }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(
      service.create({ title: 'ok', urgent: false, assigneeId: 'missing' }),
    ).rejects.toMatchObject({ code: 'assignee-not-found' });
  });

  it('returns the existing request without starting a run when already accepted', async () => {
    const { database, requests } = createFakeDatabase();
    requests.rows.push(requestRow({ status: 'accepted', result: 'normal' }));
    const { users } = createFakeUsers([agentUser()]);
    const trigger = vi.fn();
    const { service } = build({ database, users, trigger });

    const outcome = await service.accept(1);

    expect(outcome).toMatchObject({
      alreadyAccepted: true,
      runId: null,
      runFinished: true,
    });
    expect(outcome.request.status).toBe('accepted');
    expect(trigger).not.toHaveBeenCalled();
  });

  it('fails closed when the acceptance workflow cannot be enabled', async () => {
    const { database, requests } = createFakeDatabase();
    requests.rows.push(requestRow());
    const { users } = createFakeUsers([agentUser()]);
    const trigger = vi.fn();
    const { service } = build({
      database,
      users,
      gate: {
        ensureEnabled: async () => ({ enabled: false, reason: 'no-artifact' }),
      } as unknown as WorkflowGate,
      trigger,
    });

    await expect(service.accept(1)).rejects.toMatchObject({
      code: 'workflow-unavailable',
    });
    expect(trigger).not.toHaveBeenCalled();
  });

  it('triggers the workflow and reports the outcome of the run', async () => {
    const { database, requests, runs } = createFakeDatabase();
    requests.rows.push(requestRow({ id: 9, urgent: true }));
    runs.rows.push({ id: 7, status: 1, finishedAt: new Date() });
    const { users } = createFakeUsers([agentUser()]);
    const trigger = vi.fn(
      async (key: string, input: Record<string, unknown>) => {
        requests.updateMany({
          filter: { id: Number(input.requestId) },
          values: { status: 'accepted', result: 'urgent' },
        });
        return {
          status: 'accepted' as const,
          eventKey: `${key}:event`,
          runId: '7',
        };
      },
    );
    const { service } = build({ database, users, trigger });

    const outcome: ServiceRequestAcceptOutcome = await service.accept(9);

    expect(trigger).toHaveBeenCalledWith(SERVICE_REQUEST_WORKFLOW_KEY, {
      requestId: '9',
    });
    expect(outcome).toMatchObject({
      runId: '7',
      runFinished: true,
      alreadyAccepted: false,
    });
    expect(outcome.request).toMatchObject({
      status: 'accepted',
      result: 'urgent',
    });
  });

  it('lists enabled users as assignee options', async () => {
    const { database } = createFakeDatabase();
    const { users } = createFakeUsers([agentUser()]);
    const { service } = build({ database, users });

    const assignees: ServiceRequestAssignee[] = await service.listAssignees();

    expect(assignees).toEqual([
      {
        id: 'agent-1',
        name: 'Service Agent',
        username: 'agent',
        email: 'agent@example.com',
      },
    ]);
  });

  it('reports a missing request as not-found', async () => {
    const { database } = createFakeDatabase();
    const { users } = createFakeUsers([agentUser()]);
    const { service } = build({ database, users });

    await expect(service.accept(404)).rejects.toBeInstanceOf(
      ServiceRequestError,
    );
    await expect(service.accept(404)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('service request API routes', () => {
  const supervisorHeader = { 'x-test-auth': 'supervisor' };

  function createRouter(service: ServiceRequestsService): Hono {
    const container = new ServiceContainer();
    container.instance(authenticationToken, {
      required:
        () =>
        async (context: Context, next: Next): Promise<Response | void> => {
          if (context.req.header('x-test-auth') !== 'supervisor') {
            return context.json({ error: 'unauthorized' }, 401);
          }
          await next();
        },
    } as never);
    container.instance(serviceRequestsServiceToken, service);
    return serviceRequestApiRoutes.createRouter({
      container,
    } as unknown as Application) as Hono;
  }

  function fakeService(
    overrides: Partial<ServiceRequestsService> = {},
  ): ServiceRequestsService {
    return {
      list: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      create: vi.fn(async () => ({}) as ServiceRequestView),
      accept: vi.fn(async () => ({}) as ServiceRequestAcceptOutcome),
      listAssignees: vi.fn(async () => []),
      ...overrides,
    };
  }

  it('rejects anonymous requests before reaching the service', async () => {
    const service = fakeService();
    const router = createRouter(service);

    const response = await router.request('/service-requests');

    expect(response.status).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('serves the list to an authenticated caller', async () => {
    const rows = [{ id: 1 }] as unknown as ServiceRequestView[];
    const service = fakeService({ list: vi.fn(async () => rows) });
    const router = createRouter(service);

    const response = await router.request('/service-requests', {
      headers: supervisorHeader,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: rows });
  });

  it('resolves the assignee list before the id route', async () => {
    const assignees = [
      { id: 'agent-1' },
    ] as unknown as ServiceRequestAssignee[];
    const get = vi.fn(async () => undefined);
    const service = fakeService({
      listAssignees: vi.fn(async () => assignees),
      get,
    });
    const router = createRouter(service);

    const response = await router.request('/service-requests/assignees', {
      headers: supervisorHeader,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: assignees });
    expect(get).not.toHaveBeenCalled();
  });

  it('maps create validation failures to 400', async () => {
    const service = fakeService({
      create: vi.fn(async () => {
        throw new ServiceRequestError('invalid-input', 'A title is required.');
      }),
    });
    const router = createRouter(service);

    const response = await router.request('/service-requests', {
      method: 'POST',
      headers: { ...supervisorHeader, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'invalid-input',
      message: 'A title is required.',
    });
  });

  it('maps workflow-unavailable acceptance failures to 503', async () => {
    const service = fakeService({
      accept: vi.fn(async () => {
        throw new ServiceRequestError('workflow-unavailable', 'not enabled');
      }),
    });
    const router = createRouter(service);

    const response = await router.request('/service-requests/1/accept', {
      method: 'POST',
      headers: supervisorHeader,
    });

    expect(response.status).toBe(503);
  });

  it('returns 404 for a non-numeric or missing request', async () => {
    const get = vi.fn(async () => undefined);
    const service = fakeService({ get });
    const router = createRouter(service);

    const nonNumeric = await router.request('/service-requests/abc', {
      headers: supervisorHeader,
    });
    expect(nonNumeric.status).toBe(404);
    expect(get).not.toHaveBeenCalled();

    const missing = await router.request('/service-requests/999', {
      headers: supervisorHeader,
    });
    expect(missing.status).toBe(404);
    expect(get).toHaveBeenCalledWith(999);
  });

  it('returns the created request with 201', async () => {
    const created = {
      id: 2,
      status: 'pending',
    } as unknown as ServiceRequestView;
    const create = vi.fn(async () => created);
    const router = createRouter(fakeService({ create }));

    const response = await router.request('/service-requests', {
      method: 'POST',
      headers: { ...supervisorHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Printer offline',
        urgent: false,
        assigneeId: 'agent-1',
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ data: created });
    expect(create).toHaveBeenCalledWith({
      title: 'Printer offline',
      urgent: false,
      assigneeId: 'agent-1',
    });
  });
});
