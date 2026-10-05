// @vitest-environment node

// The overdue-reminder plan answers `reminded: 0` while work orders were in fact
// overdue, because it only looked at inspection tasks and counted sends rather
// than deliveries. These guards pin the corrected contract:
//
//   * the scan targets *un-closed* work orders whose deadline has passed, so a
//     closed or future-dated order is never reminded;
//   * `reminded` counts a message the notification service actually accepted,
//     and a deduplicated delivery (the "at most once per day" guarantee) is not
//     counted again;
//   * both the work-order and inspection halves share one run receipt.
import { describe, expect, it } from 'vitest';

import type { DatabaseManager } from '@nocobase/db';

import { ServiceOperations } from '../../server/providers/service/operations.js';
import type { ServiceAccess } from '../../server/providers/service/access.js';
import type {
  NotificationPort,
  NotificationSendInput,
} from '../../server/providers/service/ports.js';

type Row = Record<string, unknown>;
type RepoMethod = 'findOne' | 'findMany' | 'count' | 'createOne' | 'updateMany';

interface RepoArgs {
  readonly filter?: unknown;
  readonly [key: string]: unknown;
}

type RepoHandler = (args: RepoArgs) => unknown;

interface FilterCall {
  readonly kind: string;
  readonly path: string;
  readonly op: string;
  readonly value?: unknown;
}

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

/** A chainable stand-in for the repository filter builder that records calls. */
function recordingFilter(log: FilterCall[]): unknown {
  const leaf = (kind: string, path: string) => {
    const node: Record<string, unknown> = {};
    const record = (op: string) => (value?: unknown) => {
      log.push({ kind, path, op, value });
      return node;
    };
    node.eq = record('eq');
    node.ne = record('ne');
    node.before = record('before');
    node.after = record('after');
    node.isTrue = record('isTrue');
    return node;
  };
  const group = (op: 'and' | 'or') => (nodes: unknown[]) => {
    log.push({ kind: 'group', path: op, op, value: nodes.length });
    return { [op]: nodes };
  };
  return {
    number: (path: string) => leaf('number', path),
    string: (path: string) => leaf('string', path),
    date: (path: string) => leaf('date', path),
    boolean: (path: string) => leaf('boolean', path),
    and: group('and'),
    or: group('or'),
  };
}

function captureFilter(args: RepoArgs): FilterCall[] {
  const log: FilterCall[] = [];
  (args.filter as (builder: unknown) => unknown)(recordingFilter(log));
  return log;
}

function fakeNotification(
  deduplicated = false,
): NotificationPort & { readonly sent: NotificationSendInput[] } {
  const sent: NotificationSendInput[] = [];
  return {
    sent,
    async send(input) {
      sent.push(input);
      return {
        notificationId: 'notification-1',
        idempotencyKey: input.idempotencyKey,
        deduplicated,
        status: 'sent',
      };
    },
    async getByIdempotencyKey() {
      return undefined;
    },
  };
}

function buildOperations(options: {
  handlers?: Record<string, Partial<Record<RepoMethod, RepoHandler>>>;
  notification?: NotificationPort;
}): { operations: ServiceOperations; fake: FakeDatabase } {
  const fake = fakeDatabase(options.handlers ?? {});
  const operations = new ServiceOperations({
    database: fake.database,
    access: {
      requirePage: async () => undefined,
      requireRole: () => undefined,
    } as unknown as ServiceAccess,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    publicBasePath: '/main',
    ...(options.notification ? { notification: options.notification } : {}),
  });
  return { operations, fake };
}

const overdueOrder: Row = {
  id: 3,
  orderNo: 'WO-2026-0003',
  status: 'processing',
  assigneeId: 2,
  deadline: new Date('2026-01-01T00:00:00.000Z'),
};

const now = new Date('2026-03-15T04:00:00.000Z'); // 2026-03-15 in Shanghai

function handlers(
  orders: readonly Row[] = [overdueOrder],
  inspections: readonly Row[] = [],
): Record<string, Partial<Record<RepoMethod, RepoHandler>>> {
  return {
    serviceWorkOrders: { findMany: async () => orders },
    serviceEngineerMembers: {
      findOne: async () => ({ id: 2, userId: 'user-engineer' }),
    },
    serviceInspectionTasks: {
      findMany: async () => inspections,
      updateMany: async () => ({ updatedCount: 1 }),
    },
  };
}

describe('overdue work-order reminders', () => {
  it('scans un-closed overdue work orders rather than only inspections', async () => {
    const notification = fakeNotification();
    const { operations, fake } = buildOperations({
      handlers: handlers(),
      notification,
    });
    const result = await operations.sendOverdueReminders({ now });
    expect(result).toMatchObject({
      day: '2026-03-15',
      workOrders: 1,
      overdueWorkOrders: 1,
      inspections: 0,
      reminded: 1,
    });
    const query = fake.calls.find(
      (call) => call.name === 'serviceWorkOrders' && call.method === 'findMany',
    );
    expect(query).toBeDefined();
    const filters = captureFilter(query!.args);
    expect(filters).toContainEqual({
      kind: 'string',
      path: 'status',
      op: 'ne',
      value: 'closed',
    });
    expect(filters).toContainEqual(
      expect.objectContaining({ kind: 'date', path: 'deadline', op: 'before' }),
    );
  });

  it('notifies the assignee once per day with a day-scoped idempotency key', async () => {
    const notification = fakeNotification();
    const { operations } = buildOperations({
      handlers: handlers(),
      notification,
    });
    await operations.sendOverdueReminders({ now });
    expect(notification.sent).toHaveLength(1);
    expect(notification.sent[0]).toMatchObject({
      idempotencyKey: 'work-order.overdue:3:2026-03-15',
      source: { type: 'service-work-order', referenceId: '3' },
    });
    expect(notification.sent[0].messages.inbox).toMatchObject({
      to: 'user-engineer',
      target: { type: 'route', path: '/service/work-orders/3' },
    });
  });

  it('does not count a deduplicated delivery as reminded', async () => {
    const notification = fakeNotification(true);
    const { operations } = buildOperations({
      handlers: handlers(),
      notification,
    });
    const result = await operations.sendOverdueReminders({ now });
    expect(notification.sent).toHaveLength(1);
    expect(result.reminded).toBe(0);
    expect(result.workOrders).toBe(0);
  });

  it('counts inspection reminders alongside work orders', async () => {
    const notification = fakeNotification();
    const { operations } = buildOperations({
      handlers: handlers(
        [],
        [
          {
            id: 8,
            taskNo: 'IT-8',
            status: 'pending',
            engineerMemberId: 2,
            dueAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      ),
      notification,
    });
    const result = await operations.sendOverdueReminders({ now });
    expect(result).toMatchObject({
      workOrders: 0,
      inspections: 1,
      reminded: 1,
    });
    expect(notification.sent[0].idempotencyKey).toBe(
      'inspection.overdue:8:2026-03-15',
    );
  });

  it('reports zero when the notification service is absent', async () => {
    const { operations } = buildOperations({ handlers: handlers() });
    const result = await operations.sendOverdueReminders({ now });
    expect(result).toMatchObject({ workOrders: 0, reminded: 0 });
  });
});
