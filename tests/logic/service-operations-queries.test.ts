// @vitest-environment node

// Regression guards for three runtime defects that unit tests over pure helpers
// could not catch, because each one only appears when the domain builds a real
// repository query or applies a record-level rule:
//
//   * `listWorkOrders` compared an optional string filter against `undefined`,
//     so the route's `?? ''` default pushed an empty enum value into the query.
//   * `generateDailyInspections` bounded a `date` column with a datetime
//     string, which the repository's temporal validator refuses.
//   * `registerAttachment` allowed only the assigned engineer while
//     `capabilities().canUploadAttachment` also enabled a supervisor, so the
//     button the page showed and the rule the domain enforced disagreed.
//
// The domain is driven here with a recording repository so the exact filter it
// builds is observable without a live database. The real builder's acceptance
// of those filters is proven by the application-level smoke run recorded in the
// verification notes.
import { describe, expect, it } from 'vitest';

import type { DatabaseManager } from '@nocobase/db';

import { ServiceOperations } from '../../server/providers/service/operations.js';
import type { ServiceAccess } from '../../server/providers/service/access.js';
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
        if (handler) {
          return handler(args);
        }
        // The real repository compiles the filter it is given, so an invalid
        // filter throws here exactly as it would there.
        if (args.filter && method !== 'updateMany' && method !== 'createOne') {
          captureFilter(args);
        }
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

function buildOperations(
  handlers: Record<string, Partial<Record<RepoMethod, RepoHandler>>>,
): { operations: ServiceOperations; fake: FakeDatabase } {
  const fake = fakeDatabase(handlers);
  const operations = new ServiceOperations({
    database: fake.database,
    access: {
      requirePage: async () => undefined,
    } as unknown as ServiceAccess,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    publicBasePath: '/main',
  });
  return { operations, fake };
}

interface FilterCall {
  readonly kind: string;
  readonly path: string;
  readonly op: string;
  readonly value?: unknown;
}

/** A chainable stand-in for the repository filter builder that records calls. */
function recordingFilter(log: FilterCall[]): unknown {
  const leaf = (kind: string, path: string) => {
    const node: Record<string, unknown> = {};
    const record = (op: string) => (value?: unknown) => {
      log.push({ kind, path, op, value });
      return node;
    };
    node.eq = record('eq');
    node.includes = record('includes');
    node.isTrue = record('isTrue');
    node.isEmpty = record('isEmpty');
    node.notEmpty = record('notEmpty');
    node.notAfter = record('notAfter');
    node.notBefore = record('notBefore');
    node.before = record('before');
    return node;
  };
  const group = (op: 'and' | 'or') => (nodes: unknown[]) => {
    log.push({ kind: 'group', path: op, op, value: nodes.length });
    return { [op]: nodes };
  };
  return {
    number: (path: string) => leaf('number', path),
    string: (path: string) => leaf('string', path),
    boolean: (path: string) => leaf('boolean', path),
    date: (path: string) => leaf('date', path),
    and: group('and'),
    or: group('or'),
  };
}

function captureFilter(args: RepoArgs): FilterCall[] {
  const log: FilterCall[] = [];
  const builder = recordingFilter(log);
  (args.filter as (b: unknown) => unknown)(builder);
  return log;
}

describe('listWorkOrders optional filters', () => {
  it("ignores the route's empty-string priority default", async () => {
    const { operations } = buildOperations({});
    await expect(
      operations.listWorkOrders(manager, { priority: '' }),
    ).resolves.toMatchObject({ total: 0, rows: [] });
  });

  it('filters by a known priority and rejects an unknown one', async () => {
    const { operations, fake } = buildOperations({});
    await operations.listWorkOrders(manager, { priority: 'urgent' });
    const count = fake.calls.find(
      (call) => call.name === 'serviceWorkOrders' && call.method === 'count',
    );
    expect(count).toBeDefined();
    expect(captureFilter(count!.args)).toContainEqual({
      kind: 'string',
      path: 'priority',
      op: 'eq',
      value: 'urgent',
    });

    await expect(
      operations.listWorkOrders(manager, { priority: 'sometime' }),
    ).rejects.toThrow(/Unknown work-order priority/);
  });

  it('pushes no priority filter at all for the empty default', async () => {
    const { operations, fake } = buildOperations({});
    await operations.listWorkOrders(manager, { priority: '' });
    const count = fake.calls.find(
      (call) => call.name === 'serviceWorkOrders' && call.method === 'count',
    );
    expect(captureFilter(count!.args)).not.toContainEqual(
      expect.objectContaining({ path: 'priority' }),
    );
  });
});

describe('generateDailyInspections date bound', () => {
  it('bounds the date column with a date-only inclusive value', async () => {
    const { operations, fake } = buildOperations({});
    await operations.generateDailyInspections({ planDate: '2026-03-15' });

    const query = fake.calls.find(
      (call) => call.name === 'serviceEquipment' && call.method === 'findMany',
    );
    expect(query).toBeDefined();
    const filters = captureFilter(query!.args);
    expect(filters).toContainEqual({
      kind: 'date',
      path: 'nextInspectionDate',
      op: 'notEmpty',
    });
    expect(filters).toContainEqual({
      kind: 'date',
      path: 'nextInspectionDate',
      op: 'notAfter',
      value: '2026-03-15',
    });
    // A datetime bound is what the validator refused; the fix is date-only.
    for (const call of filters) {
      if (call.path === 'nextInspectionDate') {
        expect(typeof call.value === 'string' ? call.value : '').not.toMatch(
          /T\d{2}:/,
        );
      }
    }
  });
});

describe('registerAttachment authorization', () => {
  const order: Row = { id: 7, status: 'processing', assigneeId: 2 };

  function handlers(
    ext = 'png',
  ): Record<string, Partial<Record<RepoMethod, RepoHandler>>> {
    // A stored file the `updateMany` call mutates, so the final read returns the
    // category the domain just wrote rather than a frozen fixture.
    const file: Row = {
      id: 'file-1',
      ext,
      filename: 'visit.png',
      workOrderId: null,
    };
    return {
      serviceWorkOrders: {
        findOne: async () => order,
      },
      serviceWorkOrderFiles: {
        findOne: async () => file,
        updateMany: async (args) => {
          Object.assign(file, args.values ?? {});
          return { updated: 1 };
        },
      },
    };
  }

  it('lets a supervisor attach evidence to an order handled by an engineer', async () => {
    const { operations } = buildOperations(handlers());
    await expect(
      operations.registerAttachment(manager, 7, {
        fileId: 'file-1',
        category: 'photo',
      }),
    ).resolves.toMatchObject({ id: 'file-1', category: 'photo' });
  });

  it('refuses an engineer who is neither the assignee nor a collaborator', async () => {
    const { operations } = buildOperations({
      ...handlers(),
      serviceWorkOrderShares: { findMany: async () => [] },
    });
    const outsider: ServiceActor = {
      userId: 'user-other',
      name: 'Other Engineer',
      email: 'other@example.com',
      roles: ['engineer'],
      memberId: 99,
      memberGroupId: 1,
    };
    await expect(
      operations.registerAttachment(outsider, 7, {
        fileId: 'file-1',
        category: 'photo',
      }),
    ).rejects.toThrow(/was not found/);
  });

  it('still rejects an extension the category does not allow', async () => {
    const { operations } = buildOperations(handlers('txt'));
    await expect(
      operations.registerAttachment(manager, 7, {
        fileId: 'file-1',
        category: 'photo',
      }),
    ).rejects.toThrow(/must be one of: png, jpg, jpeg/);
  });
});
