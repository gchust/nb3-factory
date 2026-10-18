// @vitest-environment node
/**
 * The repair workflow as a state machine, on a memory store and a fake clock: who may fire what, what each
 * transition records, who is notified, and the overdue reminder nobody fires by hand.
 */
import { LifecycleError } from '@nocobase/lifecycle';
import { createLifecycleTestKit } from '@nocobase/lifecycle/testing';
import { describe, expect, it, vi } from 'vitest';

import {
  TICKET_LIFECYCLE,
  ticketLifecycle,
  type TicketLifecycleServices,
  type TicketRecord,
} from '../../server/lifecycles/tickets.js';

const HELP_DESK = 'desk';
const ENGINEER = 'erin';
const OTHER_ENGINEER = 'gina';
const EMPLOYEE = 'frank';

const ENGINEERS = new Set([ENGINEER, OTHER_ENGINEER]);

function fakeServices(
  overrides: Partial<TicketLifecycleServices> = {},
): TicketLifecycleServices {
  return {
    rolesOf: async (userId) => ({
      helpdesk: userId === HELP_DESK,
      engineer: ENGINEERS.has(userId),
    }),
    engineerExists: async (userId) => ENGINEERS.has(userId),
    helpdeskUserIds: async () => [HELP_DESK],
    notify: vi.fn(async () => {}),
    ...overrides,
  };
}

function newTicket(): { values: Record<string, unknown>; actor: string } {
  return {
    values: {
      title: 'The meeting room projector has no signal',
      description: 'The projector shows "no signal" for every cable.',
      urgency: 'normal',
      requesterId: EMPLOYEE,
    },
    actor: EMPLOYEE,
  };
}

async function kitWith(
  overrides: Partial<TicketLifecycleServices> = {},
): Promise<{
  kit: ReturnType<typeof createLifecycleTestKit>;
  services: TicketLifecycleServices;
  ticket: TicketRecord;
}> {
  const services = fakeServices(overrides);
  const kit = createLifecycleTestKit(ticketLifecycle, { services });
  const { values, actor } = newTicket();
  const ticket = await kit.start(values, { actor });
  return { kit, services, ticket };
}

describe('the tickets lifecycle', () => {
  it('walks a ticket from submission to a confirmed close', async () => {
    const { kit, services, ticket } = await kitWith();

    await kit.fire(
      ticket,
      'assign',
      { assigneeId: ENGINEER },
      { actor: HELP_DESK },
    );
    expect(kit.get(ticket).status).toBe('assigned');
    expect(services.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [ENGINEER],
        path: `/tickets/${ticket.id}`,
        title: expect.stringContaining('assigned to you'),
      }),
    );

    await kit.fire(ticket, 'start', {}, { actor: ENGINEER });
    expect(kit.get(ticket).status).toBe('processing');

    await kit.fire(
      ticket,
      'resolve',
      { solution: 'Replaced the HDMI cable.' },
      { actor: ENGINEER },
    );
    expect(kit.get(ticket).status).toBe('resolved');
    expect(kit.get(ticket).solution).toBe('Replaced the HDMI cable.');
    expect(services.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [EMPLOYEE],
        title: expect.stringContaining('is resolved — please confirm'),
      }),
    );

    await kit.fire(ticket, 'confirm', {}, { actor: EMPLOYEE });
    expect(kit.get(ticket).status).toBe('closed');
    expect(await kit.history(ticket)).toEqual([
      '$create',
      'assign',
      'start',
      'resolve',
      'confirm',
    ]);
  });

  it('refuses a transition from a caller without the role, with the guard’s code', async () => {
    const { kit, ticket } = await kitWith();

    const assign = await kit
      .fire(ticket, 'assign', { assigneeId: ENGINEER }, { actor: EMPLOYEE })
      .catch((error: unknown) => error);
    expect(assign).toBeInstanceOf(LifecycleError);
    expect((assign as LifecycleError).blockers[0]).toMatchObject({
      code: 'NOT_HELPDESK',
    });

    await kit.fire(
      ticket,
      'assign',
      { assigneeId: ENGINEER },
      { actor: HELP_DESK },
    );
    const start = await kit
      .fire(ticket, 'start', {}, { actor: OTHER_ENGINEER })
      .catch((error: unknown) => error);
    expect((start as LifecycleError).blockers[0]).toMatchObject({
      code: 'NOT_ASSIGNEE',
    });

    await kit.fire(
      ticket,
      'resolve',
      { solution: 'Rebooted.' },
      { actor: ENGINEER },
    );
    const confirm = await kit
      .fire(ticket, 'confirm', {}, { actor: ENGINEER })
      .catch((error: unknown) => error);
    expect((confirm as LifecycleError).blockers[0]).toMatchObject({
      code: 'NOT_REQUESTER',
    });
  });

  it('names the input a transition needs', async () => {
    const { kit, ticket } = await kitWith();
    await kit.fire(
      ticket,
      'assign',
      { assigneeId: ENGINEER },
      { actor: HELP_DESK },
    );

    const resolve = await kit
      .fire(ticket, 'resolve', {}, { actor: ENGINEER })
      .catch((error: unknown) => error);
    expect(resolve).toBeInstanceOf(LifecycleError);
    expect((resolve as LifecycleError).problems).toMatchObject([
      { field: 'solution' },
    ]);

    const assignNobody = await kit
      .fire(
        ticket,
        'reassign',
        { assigneeId: OTHER_ENGINEER },
        { actor: HELP_DESK },
      )
      .catch((error: unknown) => error);
    // `reassign` is not available from `assigned`; the state refuses before the input is read.
    expect((assignNobody as LifecycleError).code).toBe('INVALID_STATE');
  });

  it('sends a resolved ticket back to its engineer', async () => {
    const { kit, services, ticket } = await kitWith();
    await kit.fire(
      ticket,
      'assign',
      { assigneeId: ENGINEER },
      { actor: HELP_DESK },
    );
    await kit.fire(
      ticket,
      'resolve',
      { solution: 'Replaced the cable.' },
      { actor: ENGINEER },
    );
    vi.mocked(services.notify).mockClear();

    await kit.fire(
      ticket,
      'return',
      { returnReason: 'It broke again.' },
      { actor: EMPLOYEE },
    );
    expect(kit.get(ticket).status).toBe('returned');
    expect(kit.get(ticket).returnReason).toBe('It broke again.');
    expect(services.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [ENGINEER],
        title: expect.stringContaining('returned for further handling'),
      }),
    );

    await kit.fire(ticket, 'rework', {}, { actor: ENGINEER });
    expect(kit.get(ticket).status).toBe('processing');
  });

  it('lets the service desk reassign a returned ticket', async () => {
    const { kit, ticket } = await kitWith();
    await kit.fire(
      ticket,
      'assign',
      { assigneeId: ENGINEER },
      { actor: HELP_DESK },
    );
    await kit.fire(
      ticket,
      'resolve',
      { solution: 'Rebooted.' },
      { actor: ENGINEER },
    );
    await kit.fire(
      ticket,
      'return',
      { returnReason: 'Still broken.' },
      { actor: EMPLOYEE },
    );

    await kit.fire(
      ticket,
      'reassign',
      { assigneeId: OTHER_ENGINEER },
      { actor: HELP_DESK },
    );
    expect(kit.get(ticket)).toMatchObject({
      status: 'assigned',
      assigneeId: OTHER_ENGINEER,
    });
  });

  it('refuses an assignee who is not an engineer as a precondition, not a permission', async () => {
    const { kit, ticket } = await kitWith();
    const refused = await kit
      .fire(ticket, 'assign', { assigneeId: EMPLOYEE }, { actor: HELP_DESK })
      .catch((error: unknown) => error);
    expect((refused as LifecycleError).blockers[0]).toMatchObject({
      code: 'NOT_ENGINEER',
      kind: 'precondition',
    });
  });

  it('reminds the service desk once a ticket has waited a day, and cannot be fired by hand', async () => {
    const { kit, services, ticket } = await kitWith();

    const manual = await kit.runtime
      .fire(TICKET_LIFECYCLE, ticket.id, 'remindOverdue', {
        actor: { id: HELP_DESK },
        input: {},
        manual: true,
      })
      .catch((error: unknown) => error);
    expect((manual as LifecycleError).code).toBe('NOT_MANUAL');

    kit.advance({ hours: 23 });
    await kit.runTriggers();
    expect(services.notify).not.toHaveBeenCalled();

    kit.advance({ hours: 2 });
    await kit.runTriggers();
    expect(services.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [HELP_DESK],
        title: expect.stringContaining('has been open over 24 hours'),
      }),
    );
    expect(await kit.history(ticket)).toEqual(['$create', 'remindOverdue']);
    // The reminder resets the clock in place rather than closing the ticket.
    expect(kit.get(ticket).status).toBe('submitted');
  });

  it('does not remind anyone about a closed ticket', async () => {
    const { kit, services, ticket } = await kitWith();
    await kit.fire(
      ticket,
      'assign',
      { assigneeId: ENGINEER },
      { actor: HELP_DESK },
    );
    await kit.fire(
      ticket,
      'resolve',
      { solution: 'Fixed.' },
      { actor: ENGINEER },
    );
    await kit.fire(ticket, 'confirm', {}, { actor: EMPLOYEE });
    vi.mocked(services.notify).mockClear();

    kit.advance({ days: 3 });
    await kit.runTriggers();
    expect(services.notify).not.toHaveBeenCalled();
  });

  it('lets the requester cancel while the ticket is open', async () => {
    const { kit, ticket } = await kitWith();
    await kit.fire(
      ticket,
      'cancel',
      { returnReason: 'No longer needed.' },
      { actor: EMPLOYEE },
    );
    expect(kit.get(ticket)).toMatchObject({ status: 'cancelled' });
  });
});
