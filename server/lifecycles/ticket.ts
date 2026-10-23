import {
  defineEffect,
  defineLifecycle,
  describeLifecycle,
  type EffectDefinition,
  type GuardVerdict,
  type TransitionContext,
} from '@nocobase/lifecycle';

import type { TicketRecord, TicketTypes } from './ticket-types.js';

/**
 * The ticket lifecycle: from a reported repair request to a closure the reporter confirmed.
 *
 * The states are the business's own wording — pending assignment, assigned, being handled, waiting for the reporter's
 * confirmation, closed — and every rule about who may move a ticket is a guard here rather than a check in a route.
 * A route that forgot a check therefore cannot hand a ticket to the wrong person, and the management page's diagram
 * shows exactly the transitions the runtime will accept.
 */

const SERVICE_DESK_ONLY = 'Only the service desk may assign a ticket.';
const HANDLER_ONLY =
  'Only the assigned engineer or the service desk may do this.';
const REPORTER_ONLY = 'Only the reporter or the service desk may do this.';

/** Reads the actor's role and the record's place in the request, and answers as a guard does. */
async function mayAssign(
  context: TransitionContext<TicketTypes>,
): Promise<GuardVerdict> {
  return (await context.services.roles.isServiceDesk(context.actor.id))
    ? true
    : SERVICE_DESK_ONLY;
}

async function mayHandle(
  context: TransitionContext<TicketTypes>,
): Promise<GuardVerdict> {
  if (context.record.assigneeId === context.actor.id) {
    return true;
  }
  return (await context.services.roles.isServiceDesk(context.actor.id))
    ? true
    : HANDLER_ONLY;
}

async function mayDecide(
  context: TransitionContext<TicketTypes>,
): Promise<GuardVerdict> {
  if (context.record.reporterId === context.actor.id) {
    return true;
  }
  return (await context.services.roles.isServiceDesk(context.actor.id))
    ? true
    : REPORTER_ONLY;
}

function requiredText(
  input: Record<string, unknown>,
  field: string,
  label: string,
) {
  const value = input[field];
  return typeof value === 'string' && value.trim()
    ? null
    : `${label} is required.`;
}

/**
 * Assignment writes the person the ticket now belongs to. The name is accepted beside the id so a page can show a
 * person without a join, and the transition refuses an assignment to nobody.
 */
const assignmentEffect = defineEffect<TicketTypes>({
  name: 'notify:assignment',
  async run(context) {
    await context.services.notify.assignment(
      context.record,
      context.idempotencyKey,
    );
  },
});

const resolutionEffect = defineEffect<TicketTypes>({
  name: 'notify:resolution',
  async run(context) {
    await context.services.notify.resolution(
      context.record,
      context.idempotencyKey,
    );
  },
});

const returnedEffect = defineEffect<TicketTypes>({
  name: 'notify:returned',
  async run(context) {
    await context.services.notify.returned(
      context.record,
      context.idempotencyKey,
      typeof context.input.reason === 'string'
        ? context.input.reason
        : undefined,
    );
  },
});

const reopenedEffect = defineEffect<TicketTypes>({
  name: 'notify:reopened',
  async run(context) {
    await context.services.notify.reopened(
      context.record,
      context.idempotencyKey,
      typeof context.input.reason === 'string'
        ? context.input.reason
        : undefined,
    );
  },
});

const closedEffect = defineEffect<TicketTypes>({
  name: 'notify:closed',
  async run(context) {
    await context.services.notify.closed(
      context.record,
      context.idempotencyKey,
    );
  },
});

/** Assignment and reassignment share one notification, so a ticket handed on says the same thing both times. */
const assignmentEffects: readonly EffectDefinition<TicketTypes>[] = [
  assignmentEffect,
];

export const ticketLifecycle = defineLifecycle<TicketTypes>({
  name: 'ticket',
  collection: 'tickets',
  initial: 'submitted',
  parameters: {
    overdueHours: 24,
    maxReopenCount: 3,
  },
  states: [
    {
      name: 'submitted',
      title: 'Pending assignment',
      meta: { tone: 'warning' },
    },
    { name: 'assigned', title: 'Assigned', meta: { tone: 'info' } },
    { name: 'inProgress', title: 'Being handled', meta: { tone: 'info' } },
    {
      name: 'resolved',
      title: 'Waiting for confirmation',
      meta: { tone: 'success' },
    },
    // Closed is the end of the reported problem, not the end of the process: the reporter or the service desk may reopen
    // a closed ticket when the fix did not hold, so the state carries no `final` marker and the diagram draws the
    // reopen edge it would otherwise have to hide.
    { name: 'closed', title: 'Closed', meta: { tone: 'neutral' } },
  ],
  create: {
    guard(context) {
      return context.actor.id
        ? true
        : 'A ticket must be reported by a signed-in person.';
    },
  },
  transitions: {
    assign: {
      title: 'Assign',
      from: ['submitted', 'assigned', 'inProgress'],
      to: 'assigned',
      guard: mayAssign,
      accept: ['assigneeId', 'assigneeName'],
      validate(input) {
        return requiredText(input, 'assigneeId', 'An engineer to assign');
      },
      set(context) {
        return {
          // A ticket that was being handled and is handed to someone else starts again for the new person, so the
          // reporter's confirmation state cannot carry over from the previous handler.
          resolvedAt: null,
          closedAt: null,
          updatedAt: context.now.toISOString(),
        };
      },
      effects: assignmentEffects,
      meta: { tone: 'primary', confirm: false },
    },
    reassign: {
      title: 'Reassign',
      from: ['assigned', 'inProgress'],
      to: 'assigned',
      guard: mayAssign,
      accept: ['assigneeId', 'assigneeName'],
      validate(input) {
        return requiredText(input, 'assigneeId', 'An engineer to assign');
      },
      set(context) {
        return {
          resolvedAt: null,
          closedAt: null,
          updatedAt: context.now.toISOString(),
        };
      },
      effects: assignmentEffects,
      meta: { tone: 'primary', confirm: false },
    },
    start: {
      title: 'Start handling',
      from: 'assigned',
      to: 'inProgress',
      guard: mayHandle,
      set(context) {
        return { updatedAt: context.now.toISOString() };
      },
      meta: { tone: 'primary' },
    },
    resolve: {
      title: 'Record resolution',
      from: 'inProgress',
      to: 'resolved',
      guard: mayHandle,
      accept: ['resolution'],
      validate(input) {
        return requiredText(input, 'resolution', 'What was done to fix it');
      },
      set(context) {
        return {
          resolvedAt: context.now.toISOString(),
          updatedAt: context.now.toISOString(),
        };
      },
      effects: [resolutionEffect],
      meta: { tone: 'success', confirm: false },
    },
    confirm: {
      title: 'Confirm and close',
      from: 'resolved',
      to: 'closed',
      guard: mayDecide,
      set(context) {
        return {
          closedAt: context.now.toISOString(),
          updatedAt: context.now.toISOString(),
        };
      },
      effects: [closedEffect],
      meta: { tone: 'success' },
    },
    returnForRework: {
      title: 'Return for further handling',
      from: 'resolved',
      to: 'inProgress',
      guard: mayDecide,
      // `reason` is not a column on the ticket: it is written to the comment the transition records and read by the
      // notification effect, so it is validated but not `accept`ed onto the record.
      validate(input) {
        return requiredText(input, 'reason', 'What is still wrong');
      },
      set(context) {
        // The resolution no longer describes the ticket's state, and the previous close is history the comment log
        // keeps; the record keeps only the current outcome.
        return {
          resolvedAt: null,
          closedAt: null,
          updatedAt: context.now.toISOString(),
        };
      },
      effects: [returnedEffect],
      meta: { tone: 'warning' },
    },
    reopen: {
      title: 'Reopen',
      from: 'closed',
      to: 'inProgress',
      guard(context) {
        const max = context.parameters.maxReopenCount;
        if (context.record.reopenCount >= max) {
          return {
            code: 'REOPEN_LIMIT_REACHED',
            kind: 'precondition',
            message: `A closed ticket can be reopened ${max} time(s); the service desk has to record a new ticket after that.`,
          };
        }
        return mayDecide(context);
      },
      validate(input) {
        return requiredText(input, 'reason', 'Why the fix did not hold');
      },
      set(context) {
        return {
          resolvedAt: null,
          closedAt: null,
          reopenCount: (context.record.reopenCount ?? 0) + 1,
          lastReopenedAt: context.now.toISOString(),
          updatedAt: context.now.toISOString(),
        };
      },
      effects: [reopenedEffect],
      meta: { tone: 'warning' },
    },
  },
  /**
   * The lifecycle itself sends no entry notification: `notify:created` is a business fact of reporting a request, not
   * of entering `submitted`, and the service sends it once the creation has committed. Every later notice belongs to
   * the transition that produced it, so a transition the runtime retries does not send the same message twice.
   */
  onEnter: {},
});

/** What the management page and the diagram draw. */
export const ticketLifecycleDescription = describeLifecycle(ticketLifecycle);

/** The transitions a person may fire, in the order a page should show them. */
export const TICKET_TRANSITIONS = [
  'assign',
  'reassign',
  'start',
  'resolve',
  'confirm',
  'returnForRework',
  'reopen',
] as const;

export type TicketTransitionName = (typeof TICKET_TRANSITIONS)[number];

/** The fields a transition reads from the request body; used by the route's validator. */
export const TICKET_TRANSITION_INPUTS: Readonly<
  Record<TicketTransitionName, readonly string[]>
> = {
  assign: ['assigneeId', 'assigneeName'],
  reassign: ['assigneeId', 'assigneeName'],
  start: [],
  resolve: ['resolution'],
  confirm: [],
  returnForRework: ['reason'],
  reopen: ['reason'],
};

export function isTicketRecord(value: unknown): value is TicketRecord {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as TicketRecord).id === 'string' &&
    typeof (value as TicketRecord).status === 'string'
  );
}
