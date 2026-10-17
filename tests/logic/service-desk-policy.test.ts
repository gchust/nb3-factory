// @vitest-environment node
import type {
  AuthorizationContext,
  AuthorizationDecision,
} from '@nocobase/authorization/core';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { describe, expect, it, vi } from 'vitest';

import { ServiceDeskService } from '../../server/service-desk/service.js';
import type { TicketRow } from '../../server/service-desk/resources.js';

const ticketPolicy = { scope: 'tickets' };
const commentPolicy = { scope: 'comments' };

const ticket: TicketRow = {
  id: 1,
  title: 'VPN access is failing',
  description: 'Cannot connect.',
  status: 'open',
  priority: 'high',
  requesterId: 'user-1',
  assigneeId: null,
  resolution: null,
  slaDueAt: '2026-10-18T05:00:00.000Z',
  assignedAt: null,
  resolvedAt: null,
  closedAt: null,
  reopenedAt: null,
  overdueNotifiedAt: null,
  commentCount: 0,
  attachments: [],
  createdAt: '2026-10-17T05:00:00.000Z',
  updatedAt: '2026-10-17T05:00:00.000Z',
};

function harness(
  decision: AuthorizationDecision,
  options: {
    readonly actions?: readonly string[];
    readonly engineers?: readonly { id: string; name: string; email: string }[];
  } = {},
) {
  const actions = options.actions ?? ['view'];
  const policies = new Map<string, unknown>();
  const ticketRepository = {
    withPolicy(policy: unknown) {
      policies.set('serviceDeskTickets', policy);
      return this;
    },
    count: vi.fn(async () => 0),
    findMany: vi.fn(async () => []),
    findOne: vi.fn(async () => ticket),
  };
  const commentRepository = {
    withPolicy(policy: unknown) {
      policies.set('serviceDeskComments', policy);
      return this;
    },
    findMany: vi.fn(async () => []),
  };
  const database = {
    repository(name: string) {
      return name === 'serviceDeskComments'
        ? commentRepository
        : ticketRepository;
    },
  };
  const list = vi.fn(async ({ role }: { role?: string } = {}) => ({
    items:
      role === 'service-desk-engineer' ? [...(options.engineers ?? [])] : [],
    total:
      role === 'service-desk-engineer' ? (options.engineers?.length ?? 0) : 0,
  }));
  const service = new ServiceDeskService({
    database,
    userAdministration: { list },
    userManagement: { list },
  } as never);
  const authorize = vi.fn(async ({ action }: { action: string }) =>
    actions.includes(action) ? decision : { effect: 'deny' },
  );
  const authz = { authorize } as unknown as AuthorizationContext;
  return { authz, list, policies, service };
}

const allow: AuthorizationDecision = {
  effect: 'allow',
  conditions: {
    database: {
      serviceDeskTickets: ticketPolicy,
      serviceDeskComments: commentPolicy,
    },
  },
} as AuthorizationDecision;

describe('service desk repository policies', () => {
  it('reads the dashboard through the ticket collection policy', async () => {
    const { authz, policies, service } = harness(allow);

    const dashboard = await service.getDashboard(authz);

    expect(dashboard.total).toBe(0);
    expect(policies.get('serviceDeskTickets')).toBe(ticketPolicy);
  });

  it('reads ticket comments through the comment collection policy', async () => {
    const { authz, policies, service } = harness(allow);

    const detail = await service.getTicket(authz, ticket.id);

    expect(detail.id).toBe(ticket.id);
    expect(policies.get('serviceDeskTickets')).toBe(ticketPolicy);
    expect(policies.get('serviceDeskComments')).toBe(commentPolicy);
  });

  it('reports the pending queue and per-engineer workload to someone who may assign', async () => {
    const { authz, list, service } = harness(allow, {
      actions: ['view', 'assign'],
      engineers: [
        { id: 'user-2', name: 'Grace Hopper', email: 'grace@example.com' },
      ],
    });

    const dashboard = await service.getDashboard(authz);

    expect(dashboard.canAssign).toBe(true);
    expect(dashboard.unassigned).toBe(0);
    expect(dashboard.workload).toEqual([
      {
        id: 'user-2',
        name: 'Grace Hopper',
        email: 'grace@example.com',
        active: 0,
        overdue: 0,
      },
    ]);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'service-desk-engineer',
        roleScope: 'app',
        status: 'enabled',
      }),
    );
  });

  it('leaves team-wide dashboard figures out for someone who may not assign', async () => {
    const { authz, list, service } = harness(allow, {
      engineers: [
        { id: 'user-2', name: 'Grace Hopper', email: 'grace@example.com' },
      ],
    });

    const dashboard = await service.getDashboard(authz);

    expect(dashboard.canAssign).toBe(false);
    expect(dashboard.unassigned).toBe(0);
    expect(dashboard.workload).toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });

  it('denies a decision that does not carry the collection policy', async () => {
    const { authz, service } = harness({
      effect: 'allow',
      conditions: { database: {} },
      reasons: [],
    } as AuthorizationDecision);

    await expect(service.getDashboard(authz)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
  });
});

describe('service desk reopen', () => {
  it('reads the manager list outside the transaction that updates the ticket', async () => {
    const resolved: TicketRow = {
      ...ticket,
      id: 2,
      status: 'resolved',
      assigneeId: 'user-2',
      resolution: 'Restarted the VPN gateway.',
      resolvedAt: '2026-10-17T06:00:00.000Z',
    };
    let inTransaction = false;
    const updateOne = vi.fn(async () => ({ record: resolved }));
    const transaction = {
      repository(_name: string) {
        const repository = {
          withPolicy: () => repository,
          findOne: async () => resolved,
          updateOne,
          createOne: async ({ values }: { values: unknown }) => ({
            record: values,
          }),
        };
        return repository;
      },
    };
    const repository = {
      withPolicy: () => repository,
      findOne: async () => resolved,
      findMany: async () => [],
      count: async () => 0,
    };
    const database = {
      repository: (name: string) =>
        name === 'serviceDeskComments'
          ? { ...repository, findMany: async () => [], createOne: undefined }
          : repository,
      transaction: async <T>(run: (connection: unknown) => Promise<T>) => {
        inTransaction = true;
        try {
          return await run(transaction);
        } finally {
          inTransaction = false;
        }
      },
    };
    const list = vi.fn(async (input: { role?: string } = {}) => {
      if (inTransaction) {
        throw new Error(
          `user list read inside the ticket transaction (${input.role})`,
        );
      }
      return { items: [], total: 0 };
    });
    const send = vi.fn(async () => undefined);
    const service = new ServiceDeskService({
      database,
      notifications: { send },
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      userAdministration: { list },
      userManagement: { list },
    } as never);
    const decision = {
      effect: 'allow',
      conditions: {
        database: {
          serviceDeskTickets: ticketPolicy,
          serviceDeskComments: commentPolicy,
        },
      },
    } as AuthorizationDecision;
    const authz = {
      authorize: vi.fn(async () => decision),
    } as unknown as AuthorizationContext;

    const detail = await service.reopenTicket(
      authz,
      'user-1',
      2,
      'Still broken',
    );

    expect(detail.id).toBe(2);
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          status: 'assigned',
          resolution: null,
          resolvedAt: null,
        }),
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.objectContaining({
          inbox: expect.objectContaining({ to: ['user-2'] }),
        }),
      }),
    );
  });
});
