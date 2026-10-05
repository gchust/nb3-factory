// @vitest-environment node

// The device-platform integration has two halves that only work together:
//
//   * the API key an integration authenticates with must belong to the
//     *integration* account, because the external endpoint authorizes by the
//     caller's `service-integrator` role and its record scope. A key issued on a
//     supervisor's own API Keys settings page authenticates as that supervisor
//     and is refused, which is the defect these guards pin down: issuance and
//     revocation now go through the plugin's own key service for the seat's
//     user, and a key that belongs to anyone else is never deleted.
//
//   * the platform can follow a repair up, but only one it submitted: the same
//     record scope the external submit writes under decides the read, and a
//     miss answers exactly as a foreign id does so the endpoint cannot be used
//     to enumerate repairs.
//
// The domain is driven with a recording repository, so the filter it builds and
// the key operations it issues are observable without a live database.
import { describe, expect, it } from 'vitest';

import type { DatabaseManager } from '@nocobase/db';

import { ServiceOperations } from '../../server/providers/service/operations.js';
import type { ServiceAccess } from '../../server/providers/service/access.js';
import type {
  ApiKeyPort,
  ApiKeySummary,
} from '../../server/providers/service/ports.js';
import type { ServiceActor } from '../../server/providers/service/types.js';

type Row = Record<string, unknown>;
type RepoMethod = 'findOne' | 'findMany' | 'count' | 'createOne' | 'updateMany';

interface RepoArgs {
  readonly filter?: unknown;
  readonly [key: string]: unknown;
}

type RepoHandler = (args: RepoArgs) => unknown;

interface FakeDatabase {
  readonly database: DatabaseManager;
  readonly calls: { name: string; method: RepoMethod; args: RepoArgs }[];
}

function fakeDatabase(
  handlers: Record<string, Partial<Record<RepoMethod, RepoHandler>>>,
): FakeDatabase {
  const calls: FakeDatabase['calls'] = [];
  const repository = (name: string): Record<RepoMethod, unknown> => {
    const methods: RepoMethod[] = [
      'findOne',
      'findMany',
      'count',
      'createOne',
      'updateMany',
    ];
    const repo: Record<string, unknown> = {};
    for (const method of methods) {
      repo[method] = async (args: RepoArgs) => {
        calls.push({ name, method, args });
        const handler = handlers[name]?.[method];
        if (handler) return handler(args);
        if (method === 'findOne') return undefined;
        if (method === 'count') return 0;
        if (method === 'createOne') return { record: {} };
        if (method === 'updateMany') return { updated: 0 };
        return [];
      };
    }
    return repo as Record<RepoMethod, unknown>;
  };
  return {
    database: { repository } as unknown as DatabaseManager,
    calls,
  };
}

const manager: ServiceActor = {
  userId: 'user-manager',
  name: 'Supervisor',
  email: 'manager@example.com',
  roles: ['manager'],
  memberId: null,
  memberGroupId: null,
};

const integrator: ServiceActor = {
  userId: 'user-integrator',
  name: 'Device platform',
  email: 'service.integrator@example.com',
  roles: ['integrator'],
  memberId: 4,
  memberGroupId: null,
};

const engineer: ServiceActor = {
  userId: 'user-engineer',
  name: 'Engineer',
  email: 'service.engineer@example.com',
  roles: ['engineer'],
  memberId: 2,
  memberGroupId: 1,
};

/** A recording stand-in for the API Keys plugin's key service. */
function fakeApiKeys(initial: readonly ApiKeySummary[] = []): ApiKeyPort & {
  readonly created: {
    userId: string;
    name: string;
    expiresIn?: number | null;
  }[];
  readonly removed: string[];
  keys: ApiKeySummary[];
} {
  const created: { userId: string; name: string; expiresIn?: number | null }[] =
    [];
  const removed: string[] = [];
  const port = {
    configId: 'default',
    keys: [...initial],
    created,
    removed,
    async create(input: {
      userId: string;
      name: string;
      expiresIn?: number | null;
    }) {
      created.push(input);
      const key: ApiKeySummary = {
        id: 'key-new',
        name: input.name,
        prefix: 'nb_live_new',
        start: 'nb_live_n',
        enabled: true,
        createdAt: '2026-05-01T00:00:00.000Z',
        expiresAt: null,
        lastRequest: null,
      };
      port.keys = [key, ...port.keys];
      return { key, secret: 'nb_live_secret_value' };
    },
    async remove(id: string) {
      removed.push(id);
      port.keys = port.keys.filter((key) => key.id !== id);
    },
    async list() {
      return port.keys;
    },
  };
  return port as unknown as ApiKeyPort & typeof port;
}

function buildOperations(options: {
  handlers?: Record<string, Partial<Record<RepoMethod, RepoHandler>>>;
  apiKeys?: ApiKeyPort;
  access?: Partial<ServiceAccess>;
}): { operations: ServiceOperations; fake: FakeDatabase } {
  const fake = fakeDatabase(options.handlers ?? {});
  const operations = new ServiceOperations({
    database: fake.database,
    access: {
      requirePage: async () => undefined,
      requireRole: () => undefined,
      ...(options.access ?? {}),
    } as unknown as ServiceAccess,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    publicBasePath: '/main',
    ...(options.apiKeys ? { apiKeys: options.apiKeys } : {}),
  });
  return { operations, fake };
}

const seat: Row = {
  id: 4,
  ref: 'seat-integrator',
  kind: 'integrator',
  name: 'Device platform',
  email: 'service.integrator@example.com',
  userId: 'user-integrator',
  enabled: true,
};

describe('integration API key management', () => {
  it('issues a key for the integration seat, never for the caller', async () => {
    const apiKeys = fakeApiKeys();
    const { operations } = buildOperations({
      handlers: { serviceEngineerMembers: { findOne: async () => seat } },
      apiKeys,
    });
    const result = await operations.createIntegrationApiKey(manager, {
      name: 'line-a',
      expiresInDays: 30,
    });
    expect(result).toMatchObject({ secret: 'nb_live_secret_value' });
    expect(apiKeys.created).toHaveLength(1);
    expect(apiKeys.created[0]).toMatchObject({
      userId: 'user-integrator',
      name: 'line-a',
      expiresIn: 30 * 24 * 60 * 60,
    });
    expect(apiKeys.created[0].userId).not.toBe(manager.userId);
    expect(result.account).toMatchObject({ userId: 'user-integrator' });
  });

  it('refuses to issue when the integration seat has no account yet', async () => {
    const apiKeys = fakeApiKeys();
    const { operations } = buildOperations({ apiKeys });
    await expect(
      operations.createIntegrationApiKey(manager, { name: 'line-a' }),
    ).rejects.toThrow(/integration account has not been provisioned/);
    expect(apiKeys.created).toHaveLength(0);
  });

  it('refuses to issue when the API Keys plugin is not available', async () => {
    const { operations } = buildOperations({
      handlers: { serviceEngineerMembers: { findOne: async () => seat } },
    });
    await expect(
      operations.createIntegrationApiKey(manager, { name: 'line-a' }),
    ).rejects.toThrow(/API key management is not available/);
  });

  it('revokes a key of the integration account', async () => {
    const apiKeys = fakeApiKeys([
      {
        id: 'key-1',
        name: 'line-a',
        prefix: 'nb_live_a',
        start: 'nb_live_a',
        enabled: true,
        createdAt: '2026-05-01T00:00:00.000Z',
        expiresAt: null,
        lastRequest: null,
      },
    ]);
    const { operations } = buildOperations({
      handlers: { serviceEngineerMembers: { findOne: async () => seat } },
      apiKeys,
    });
    await expect(
      operations.revokeIntegrationApiKey(manager, 'key-1'),
    ).resolves.toMatchObject({ id: 'key-1', revoked: true });
    expect(apiKeys.removed).toEqual(['key-1']);
  });

  it('never deletes a key that belongs to another account', async () => {
    const apiKeys = fakeApiKeys();
    const { operations } = buildOperations({
      handlers: { serviceEngineerMembers: { findOne: async () => seat } },
      apiKeys,
    });
    await expect(
      operations.revokeIntegrationApiKey(manager, 'key-of-someone-else'),
    ).rejects.toThrow(/was not found for the integration account/);
    expect(apiKeys.removed).toEqual([]);
  });

  it('does not let an engineer manage keys', async () => {
    const apiKeys = fakeApiKeys();
    const { operations } = buildOperations({
      handlers: { serviceEngineerMembers: { findOne: async () => seat } },
      apiKeys,
      access: {
        requireRole: (actor, operation, ...roles) => {
          if (!roles.includes('manager') || !actor.roles.includes('manager')) {
            throw Object.assign(new Error(`Not permitted to ${operation}.`), {
              status: 403,
            });
          }
        },
      },
    });
    await expect(
      operations.createIntegrationApiKey(engineer, { name: 'line-a' }),
    ).rejects.toThrow(/Not permitted to create an integration API key/);
    await expect(
      operations.revokeIntegrationApiKey(engineer, 'key-1'),
    ).rejects.toThrow(/Not permitted to revoke an integration API key/);
    expect(apiKeys.created).toEqual([]);
  });

  it('lists the integration account keys with its identity', async () => {
    const apiKeys = fakeApiKeys([
      {
        id: 'key-1',
        name: 'line-a',
        prefix: 'nb_live_a',
        start: 'nb_live_a',
        enabled: true,
        createdAt: '2026-05-01T00:00:00.000Z',
        expiresAt: null,
        lastRequest: null,
      },
    ]);
    const { operations } = buildOperations({
      handlers: { serviceEngineerMembers: { findOne: async () => seat } },
      apiKeys,
    });
    const state = await operations.integrationAccountStatus(manager);
    expect(state.keysAvailable).toBe(true);
    expect(state.configId).toBe('default');
    expect(state.account).toMatchObject({
      userId: 'user-integrator',
      ref: 'seat-integrator',
    });
    expect(state.apiKeys).toHaveLength(1);
  });
});

describe('external repair status read', () => {
  const externalOrder: Row = {
    id: 21,
    orderNo: 'WO-2026-0021',
    title: 'Spindle overheat',
    problem: 'Temperature alarm at 92°C',
    status: 'processing',
    priority: 'urgent',
    source: 'external',
    createdById: 'user-integrator',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-02T00:00:00.000Z',
    closedAt: null,
    deadline: null,
  };

  function handlers(
    order: Row | null,
  ): Record<string, Partial<Record<RepoMethod, RepoHandler>>> {
    return {
      serviceWorkOrders: { findOne: async () => order ?? undefined },
      serviceExternalEvents: {
        findOne: async () => ({
          id: 3,
          eventId: 'device-2026-0001',
          source: 'device-platform',
          status: 'accepted',
          message: null,
          workOrderId: 21,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:01.000Z',
        }),
      },
      serviceWorkOrderEvents: {
        findMany: async () => [
          {
            id: 1,
            type: 'created',
            message: 'internal note that must not leak',
            actorId: 'user-integrator',
            createdAt: '2026-05-01T00:00:00.000Z',
          },
          {
            id: 2,
            type: 'state_change',
            detail: { status: 'pending_processing' },
            message: 'internal note that must not leak',
            actorId: 'user-manager',
            createdAt: '2026-05-01T01:00:00.000Z',
          },
        ],
      },
    };
  }

  it('answers the platform with its own repair and a summarized timeline', async () => {
    const { operations } = buildOperations({
      handlers: handlers(externalOrder),
    });
    const view = await operations.readExternalRepair(integrator, 21);
    expect(view).toMatchObject({
      id: 21,
      orderNo: 'WO-2026-0021',
      status: 'processing',
      source: 'external',
    });
    expect(view.externalEvent).toMatchObject({
      eventId: 'device-2026-0001',
      status: 'accepted',
    });
    const timeline = view.timeline as {
      type: string;
      message: string | null;
    }[];
    expect(timeline.map((item) => item.type)).toEqual([
      'created',
      'state_change',
    ]);
    // The event stream is summarized, so an internal note never reaches the
    // external caller.
    for (const item of timeline) {
      expect(item.message ?? '').not.toContain('must not leak');
    }
  });

  it('hides a repair that another account submitted', async () => {
    const { operations } = buildOperations({
      handlers: handlers({ ...externalOrder, createdById: 'user-elsewhere' }),
    });
    await expect(operations.readExternalRepair(integrator, 21)).rejects.toThrow(
      /Repair #21 was not found/,
    );
  });

  it('hides a manually registered work order from the platform', async () => {
    const { operations } = buildOperations({
      handlers: handlers({ ...externalOrder, source: 'manual' }),
    });
    await expect(operations.readExternalRepair(integrator, 21)).rejects.toThrow(
      /Repair #21 was not found/,
    );
  });

  it('hides a missing repair exactly as a foreign one', async () => {
    const { operations } = buildOperations({ handlers: handlers(null) });
    await expect(operations.readExternalRepair(integrator, 99)).rejects.toThrow(
      /Repair #99 was not found/,
    );
  });

  it('requires the integrator role', async () => {
    const { operations } = buildOperations({
      handlers: handlers(externalOrder),
      access: {
        requireRole: (actor, operation, ...roles) => {
          if (!roles.some((role) => actor.roles.includes(role))) {
            throw Object.assign(new Error(`Not permitted to ${operation}.`), {
              status: 403,
            });
          }
        },
      },
    });
    await expect(
      operations.readExternalRepair(integrator, 21),
    ).resolves.toMatchObject({ id: 21 });
    await expect(operations.readExternalRepair(engineer, 21)).rejects.toThrow(
      /Not permitted to read an external device repair/,
    );
  });
});
