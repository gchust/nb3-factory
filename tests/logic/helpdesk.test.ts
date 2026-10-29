import { describeLifecycle } from '@nocobase/lifecycle';
import { createLifecycleTestKit } from '@nocobase/lifecycle/testing';
import { describe, expect, it, vi } from 'vitest';

import {
  employeePermissionSet,
  serviceDeskPermissionSet,
  supportEngineerPermissionSet,
} from '../../database/seed-data/helpdesk-permission-sets.ts';
import {
  TICKET_STATE_LABELS,
  TICKET_TRANSITION_LABELS,
  ticketsLifecycle,
} from '../../server/tickets/lifecycle.ts';
import {
  summarizeTickets,
  TicketService,
} from '../../server/tickets/service.ts';
import type { TicketRecord } from '../../server/tickets/types.ts';

const grant = (permissionSet: {
  grants: readonly {
    resource: { type: string; id: string };
    actions: readonly { action: string; policy?: unknown }[];
  }[];
}) => {
  expect(permissionSet.grants).toHaveLength(1);
  const [ticketGrant] = permissionSet.grants;
  expect(ticketGrant.resource).toEqual({
    type: 'composite',
    id: 'helpdesk.tickets',
  });
  return ticketGrant;
};

const actionsOf = (permissionSet: Parameters<typeof grant>[0]) =>
  grant(permissionSet).actions.map((item) => item.action);

describe('helpdesk permission sets', () => {
  it('gives employees their own tickets only', () => {
    expect(actionsOf(employeePermissionSet)).toEqual([
      'view',
      'create',
      'reopen',
      'close',
      'comment',
      'attach',
    ]);
    for (const action of grant(employeePermissionSet).actions) {
      expect(action.policy).toEqual({
        type: 'composite',
        scopes: { ticket: 'helpdesk.ownTickets' },
      });
    }
  });

  it('gives support engineers the engineering queue and transition actions', () => {
    expect(actionsOf(supportEngineerPermissionSet)).toEqual([
      'view',
      'claim',
      'start',
      'resolve',
      'comment',
      'attach',
    ]);
    for (const action of grant(supportEngineerPermissionSet).actions) {
      expect(action.policy).toEqual({
        type: 'composite',
        scopes: { ticket: 'helpdesk.engineerTickets' },
      });
    }
  });

  it('gives the service desk every ticket and the desk transitions', () => {
    expect(actionsOf(serviceDeskPermissionSet)).toEqual([
      'view',
      'create',
      'assign',
      'start',
      'resolve',
      'reopen',
      'cancel',
      'comment',
      'attach',
    ]);
    for (const action of grant(serviceDeskPermissionSet).actions) {
      expect(action.policy).toEqual({
        type: 'composite',
        scopes: { ticket: 'allRecords' },
      });
    }
    expect(actionsOf(serviceDeskPermissionSet)).not.toContain('close');
  });
});

describe('helpdesk requester confirmation', () => {
  const notifications = {
    assigned: vi.fn(async () => undefined),
    started: vi.fn(async () => undefined),
    resolved: vi.fn(async () => undefined),
    reopened: vi.fn(async () => undefined),
    closed: vi.fn(async () => undefined),
    cancelled: vi.fn(async () => undefined),
    escalated: vi.fn(async () => undefined),
  };
  const roles: Readonly<Record<string, readonly string[]>> = {
    alice: ['employee'],
    bob: ['support-engineer'],
    dana: ['service-desk'],
  };
  const kit = createLifecycleTestKit(ticketsLifecycle, {
    services: {
      database: {} as never,
      notifications,
      people: {
        hasRole: async (userId, roleKey) =>
          roles[userId]?.includes(roleKey) ?? false,
        isRoot: async (userId) => userId === 'admin',
        listMembers: async () => [],
      },
      translate: ((key: string) => key) as never,
      roleKeys: {
        employee: 'employee',
        engineer: 'support-engineer',
        serviceDesk: 'service-desk',
      },
    },
  });

  const resolvedTicket = () => {
    const ticket = kit.create({
      ticketNo: 'TK-TEST-1',
      title: 'Laptop will not start',
      description: 'The power light is off.',
      category: 'hardware',
      priority: 'normal',
      requesterId: 'alice',
    });
    return kit.update(ticket, {
      status: 'resolved',
      assigneeId: 'bob',
      resolution: 'The charger was replaced.',
      resolvedAt: new Date(),
    });
  };

  it('lets the requester close a resolved ticket', async () => {
    const ticket = resolvedTicket();
    expect((await kit.can(ticket, 'close', 'alice')).allowed).toBe(true);
    expect((await kit.can(ticket, 'close', 'bob')).allowed).toBe(false);

    const closed = await kit.fire(ticket, 'close', {}, { actor: 'alice' });
    expect(closed.status).toBe('closed');
    expect(notifications.closed).toHaveBeenCalledOnce();
  });

  it('keeps the reopen reason in the transition rather than the ticket row', () => {
    const reopen = describeLifecycle(ticketsLifecycle).transitions.find(
      (transition) => transition.name === 'reopen',
    );
    expect(reopen?.accept ?? []).not.toContain('reason');
  });

  it('lets the requester return a resolved ticket for more work', async () => {
    const ticket = resolvedTicket();
    const closed = await kit.fire(ticket, 'close', {}, { actor: 'alice' });
    expect((await kit.can(closed, 'reopen', 'alice')).allowed).toBe(true);
    expect((await kit.can(closed, 'reopen', 'bob')).allowed).toBe(false);

    const reopened = await kit.fire(
      closed,
      'reopen',
      { reason: 'The laptop still will not start.' },
      { actor: 'alice' },
    );
    expect(reopened.status).toBe('pending');
    expect(reopened.assigneeId).toBeNull();
    expect(notifications.reopened).toHaveBeenCalledOnce();
  });
});

describe('helpdesk ticket lifecycle', () => {
  it('describes every state and transition with a label', () => {
    const description = describeLifecycle(ticketsLifecycle);
    const stateNames = description.states;
    expect(new Set(Object.keys(TICKET_STATE_LABELS))).toEqual(
      new Set(stateNames),
    );
    const transitionNames = description.transitions.map(
      (transition) => transition.name,
    );
    expect(new Set(Object.keys(TICKET_TRANSITION_LABELS))).toEqual(
      new Set(transitionNames),
    );
  });

  it('keeps closed reopenable and cancellation terminal', () => {
    const description = describeLifecycle(ticketsLifecycle);
    const closed = description.stateInfo.find(
      (state) => state.name === 'closed',
    );
    const cancelled = description.stateInfo.find(
      (state) => state.name === 'cancelled',
    );
    expect(closed?.final).not.toBe(true);
    expect(cancelled?.final).toBe(true);
    expect(
      description.transitions
        .filter((transition) => transition.from.includes('closed'))
        .map((transition) => transition.name),
    ).toEqual(['reopen']);
  });

  it('exposes the overdue trigger and hides server-only transitions', () => {
    const description = describeLifecycle(ticketsLifecycle);
    expect(description.triggers).toEqual([
      expect.objectContaining({
        name: 'overdue',
        transition: 'escalate',
        when: ['processing'],
      }),
    ]);
    expect(
      description.transitions
        .filter((transition) => !transition.manual)
        .map((transition) => transition.name)
        .sort(),
    ).toEqual(['escalate', 'touch']);
  });
});

describe('helpdesk attachment ownership', () => {
  it('only links files uploaded by the actor', async () => {
    let filter: unknown;
    const repository = {
      findMany: vi.fn(
        async ({ filter: build }: { filter: (f: unknown) => unknown }) => {
          filter = build({
            string: (field: string) => ({
              eq: (value: string) => ({ field, value }),
            }),
            and: (items: unknown[]) => ({ and: items }),
            or: (items: unknown[]) => ({ or: items }),
          });
          return [];
        },
      ),
    };
    const database = { repository: () => repository };
    const service = new TicketService(database as never, {} as never);

    await expect(
      service.linkAttachments('ticket-1', 'employee-1', ['file-1']),
    ).rejects.toMatchObject({
      code: 'TICKET_ATTACHMENT_UNAVAILABLE',
    });
    expect(filter).toEqual({
      and: [
        { field: 'ownerId', value: 'employee-1' },
        {
          or: [{ field: 'id', value: 'file-1' }],
        },
      ],
    });
  });
});

describe('helpdesk dashboard summary', () => {
  it('counts the desk queues and applies the 24-hour overdue rule', () => {
    const now = new Date('2026-10-07T12:00:00.000Z');
    const ticket = (
      id: string,
      status: 'pending' | 'processing' | 'escalated' | 'resolved' | 'closed',
      assigneeId: string | null,
      statusChangedAt: string,
    ): TicketRecord => ({
      id,
      ticketNo: `TK-${id}`,
      title: id,
      description: '',
      category: 'other',
      priority: 'normal',
      status,
      requesterId: 'employee',
      assigneeId,
      resolution: null,
      closeNote: null,
      cancelReason: null,
      statusChangedAt: new Date(statusChangedAt),
      lifecycleVersion: 0,
      resolvedAt: null,
      closedAt: null,
      createdAt: new Date(statusChangedAt),
      updatedAt: new Date(statusChangedAt),
    });
    const rows = [
      ticket('old-unassigned', 'pending', null, '2026-10-05T12:00:00.000Z'),
      ticket('new-unassigned', 'pending', null, '2026-10-07T11:00:00.000Z'),
      ticket('old-processing', 'processing', 'bob', '2026-10-06T06:00:00.000Z'),
      ticket(
        'new-processing',
        'processing',
        'carol',
        '2026-10-07T11:00:00.000Z',
      ),
      ticket('escalated', 'escalated', 'bob', '2026-10-07T11:00:00.000Z'),
      ticket('resolved', 'resolved', 'bob', '2026-10-07T10:00:00.000Z'),
      ticket('closed', 'closed', 'carol', '2026-10-01T10:00:00.000Z'),
    ];

    const result = summarizeTickets(rows, now);

    expect(result.summary).toEqual({
      total: 7,
      active: 5,
      pending: 2,
      processing: 2,
      escalated: 1,
      resolved: 1,
      closed: 1,
      cancelled: 0,
      unassigned: 2,
      overdue: 3,
    });
    expect(result.unassigned.map((row) => row.id)).toEqual([
      'old-unassigned',
      'new-unassigned',
    ]);
    expect(result.overdue.map((row) => row.id)).toEqual([
      'old-unassigned',
      'old-processing',
      'escalated',
    ]);
    expect(result.workload).toEqual([
      { id: 'bob', active: 2, escalated: 1 },
      { id: 'carol', active: 1, escalated: 0 },
    ]);
  });
});
