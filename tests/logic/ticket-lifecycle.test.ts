// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { JsonObject } from '@nocobase/lifecycle';

import {
  TICKET_TRANSITIONS,
  ticketLifecycle,
  ticketLifecycleDescription,
} from '../../server/lifecycles/ticket.js';
import type {
  TicketRecord,
  TicketRoleReader,
  TicketServices,
} from '../../server/lifecycles/ticket-types.js';

/*
 * The state machine the routes drive, checked on its own: the states, the edges, and the who-may-do-what rules. A route
 * test proves the wiring; this proves the rules, so a change that would let an engineer close their own work or reopen
 * a ticket forever fails here rather than in production.
 */

function record(overrides: Partial<TicketRecord> = {}): TicketRecord {
  return {
    id: 'ticket-1',
    title: 'Printer will not turn on',
    description: null,
    category: null,
    urgency: 'normal',
    status: 'submitted',
    statusChangedAt: new Date().toISOString(),
    lifecycleVersion: 1,
    reporterId: 'reporter',
    reporterName: 'Reporter',
    assigneeId: null,
    assigneeName: null,
    resolution: null,
    resolvedAt: null,
    closedAt: null,
    reopenCount: 0,
    lastReopenedAt: null,
    overdueNotifiedAt: null,
    attachmentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function roles(overrides: Partial<TicketRoleReader> = {}): TicketRoleReader {
  return {
    isAdmin: vi.fn(async () => false),
    isServiceDesk: vi.fn(async () => false),
    isEngineer: vi.fn(async () => false),
    serviceDeskUserIds: vi.fn(async () => []),
    engineerUserIds: vi.fn(async () => []),
    ...overrides,
  };
}

function services(roleReader: TicketRoleReader): TicketServices {
  return {
    roles: roleReader,
    notify: {
      created: vi.fn(),
      assignment: vi.fn(),
      resolution: vi.fn(),
      returned: vi.fn(),
      reopened: vi.fn(),
      closed: vi.fn(),
      overdue: vi.fn(),
    },
  };
}

function context(
  input: {
    actor?: string;
    ticket?: Partial<TicketRecord>;
    roleReader?: TicketRoleReader;
    body?: JsonObject;
    maxReopenCount?: number;
  } = {},
) {
  return {
    record: record(input.ticket),
    actor: { id: input.actor ?? 'actor' },
    input: input.body ?? {},
    parameters: {
      overdueHours: 24,
      maxReopenCount: input.maxReopenCount ?? 3,
    },
    services: services(input.roleReader ?? roles()),
    now: new Date(),
  };
}

async function guard(name: string, ctx: ReturnType<typeof context>) {
  const transition = ticketLifecycle.transitions.get(name);
  expect(transition, `transition ${name}`).toBeDefined();
  return transition!.definition.guard!(ctx);
}

describe('ticket lifecycle', () => {
  it('declares the five states from reporting to a confirmed closure', () => {
    expect(ticketLifecycleDescription.initial).toBe('submitted');
    expect(ticketLifecycleDescription.states).toEqual([
      'submitted',
      'assigned',
      'inProgress',
      'resolved',
      'closed',
    ]);
    const state = (name: string) =>
      ticketLifecycleDescription.stateInfo.find((info) => info.name === name);
    expect(state('submitted')?.title).toBe('Pending assignment');
    expect(state('closed')?.title).toBe('Closed');
    // Closed is the end of the problem, not of the process: the reporter may reopen it.
    expect(state('closed')?.final).toBe(false);
    for (const name of ['submitted', 'assigned', 'inProgress', 'resolved']) {
      expect(state(name)?.final).toBe(false);
    }
  });

  it('declares every transition a page may fire, with the states it connects', () => {
    expect(
      ticketLifecycleDescription.transitions.map(({ name }) => name),
    ).toEqual([...TICKET_TRANSITIONS]);
    const byName = new Map(
      ticketLifecycleDescription.transitions.map((transition) => [
        transition.name,
        transition,
      ]),
    );
    expect(byName.get('assign')).toMatchObject({
      from: ['submitted', 'assigned', 'inProgress'],
      to: ['assigned'],
      manual: true,
    });
    expect(byName.get('reassign')).toMatchObject({
      from: ['assigned', 'inProgress'],
      to: ['assigned'],
    });
    expect(byName.get('start')).toMatchObject({
      from: ['assigned'],
      to: ['inProgress'],
    });
    expect(byName.get('resolve')).toMatchObject({
      from: ['inProgress'],
      to: ['resolved'],
    });
    expect(byName.get('confirm')).toMatchObject({
      from: ['resolved'],
      to: ['closed'],
    });
    expect(byName.get('returnForRework')).toMatchObject({
      from: ['resolved'],
      to: ['inProgress'],
    });
    expect(byName.get('reopen')).toMatchObject({
      from: ['closed'],
      to: ['inProgress'],
    });
    // Each transition that tells someone something names its effect; a `set`-only transition has none.
    expect(byName.get('assign')?.effects).toEqual(['notify:assignment']);
    expect(byName.get('resolve')?.effects).toEqual(['notify:resolution']);
    expect(byName.get('confirm')?.effects).toEqual(['notify:closed']);
    expect(byName.get('start')?.effects).toEqual([]);
  });

  it('lets only the service desk assign a ticket', async () => {
    await expect(
      guard(
        'assign',
        context({
          roleReader: roles({ isServiceDesk: vi.fn(async () => true) }),
        }),
      ),
    ).resolves.toBe(true);
    await expect(guard('assign', context())).resolves.toBe(
      'Only the service desk may assign a ticket.',
    );
  });

  it('lets the assigned engineer or the service desk handle a ticket', async () => {
    await expect(
      guard(
        'start',
        context({ actor: 'engineer', ticket: { assigneeId: 'engineer' } }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard(
        'start',
        context({
          actor: 'service-desk',
          roleReader: roles({ isServiceDesk: vi.fn(async () => true) }),
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard(
        'start',
        context({ actor: 'someone-else', ticket: { assigneeId: 'engineer' } }),
      ),
    ).resolves.toBe(
      'Only the assigned engineer or the service desk may do this.',
    );
  });

  it('lets the reporter or the service desk decide the outcome', async () => {
    await expect(
      guard(
        'confirm',
        context({ actor: 'reporter', ticket: { reporterId: 'reporter' } }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard(
        'confirm',
        context({
          actor: 'service-desk',
          roleReader: roles({ isServiceDesk: vi.fn(async () => true) }),
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard(
        'confirm',
        context({ actor: 'engineer', ticket: { reporterId: 'reporter' } }),
      ),
    ).resolves.toBe('Only the reporter or the service desk may do this.');
  });

  it('refuses a reopen past the configured limit, whoever asks', async () => {
    const verdict = await guard(
      'reopen',
      context({
        actor: 'reporter',
        ticket: { reporterId: 'reporter', status: 'closed', reopenCount: 3 },
        maxReopenCount: 3,
      }),
    );
    expect(verdict).toMatchObject({
      code: 'REOPEN_LIMIT_REACHED',
      kind: 'precondition',
    });
    // Below the limit the reporter may reopen.
    await expect(
      guard(
        'reopen',
        context({
          actor: 'reporter',
          ticket: { reporterId: 'reporter', status: 'closed', reopenCount: 2 },
          maxReopenCount: 3,
        }),
      ),
    ).resolves.toBe(true);
  });

  it('requires the input each transition needs, and accepts what it writes', async () => {
    const validate = (name: string, input: JsonObject) =>
      ticketLifecycle.transitions.get(name)!.definition.validate?.(input);

    expect(validate('assign', {})).toBe('An engineer to assign is required.');
    expect(validate('assign', { assigneeId: 'engineer' })).toBeNull();
    expect(validate('resolve', {})).toBe(
      'What was done to fix it is required.',
    );
    expect(validate('returnForRework', {})).toBe(
      'What is still wrong is required.',
    );
    expect(validate('reopen', {})).toBe(
      'Why the fix did not hold is required.',
    );
    // `reason` is validated but is not a ticket column, so it is not copied onto the record.
    expect(
      ticketLifecycle.transitions.get('returnForRework')!.definition.accept,
    ).toBeUndefined();
    expect(
      ticketLifecycle.transitions.get('assign')!.definition.accept,
    ).toEqual(['assigneeId', 'assigneeName']);
    expect(
      ticketLifecycle.transitions.get('resolve')!.definition.accept,
    ).toEqual(['resolution']);
  });

  it('carries the defaults the management page reports, with no server-side override', () => {
    expect(ticketLifecycle.parameters).toEqual({
      overdueHours: 24,
      maxReopenCount: 3,
    });
    expect(ticketLifecycleDescription.parameterConfiguration).toBeUndefined();
  });
});
