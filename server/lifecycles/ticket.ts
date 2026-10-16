/**
 * The ticket desk's state machine.
 *
 * ```text
 *            assign                 resolve              confirm
 *  pending -----------> assigned -----------> resolved -----------> closed
 *                             ^                    |
 *                             +--------------------+
 *                                    return
 * ```
 *
 * `remind` is a self-transition of the open states that a trigger fires every
 * 24 hours, so the service desk hears about a ticket nobody picked up.
 *
 * The lifecycle only ever writes the ticket row and its own log; telling
 * people about a change is an effect, because it leaves the database.
 */
import {
  defineEffect,
  defineLifecycle,
  type EffectContext,
  type GuardVerdict,
  type LifecycleRecord,
  type LifecycleTypes,
  type TransitionContext,
  type TransitionHookContext,
} from '@nocobase/lifecycle';
import type { DatabaseConnection } from '@nocobase/db';

import type {
  TicketCommentKind,
  TicketCommentRow,
  TicketState,
  TicketUrgency,
} from '../ticket-types.js';

/** Every service a transition guard, hook or effect needs. Filled by the provider. */
export interface TicketServices {
  /** Whether the actor runs the desk: a `serviceDesk` staff row, or the application root. */
  isServiceDesk(actorId: string): Promise<boolean>;
  /** Tells the people a change concerns. Effect keys dedupe a retry. */
  notify(
    event: TicketNotificationEvent,
    record: TicketRecord,
    idempotencyKey: string,
  ): Promise<void>;
}

export type TicketNotificationEvent =
  'created' | 'assigned' | 'resolved' | 'confirmed' | 'returned' | 'reminder';

export type TicketRecord = LifecycleRecord & {
  title: string;
  description: string;
  urgency: TicketUrgency;
  status: TicketState;
  statusChangedAt: string;
  lifecycleVersion: number;
  requesterId: string;
  requesterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  resolution: string | null;
  lastReason: string | null;
  assignedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  remindedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export interface TicketParameters {
  /** How long an open ticket may wait before the desk is reminded. Defaults to a day. */
  remindAfterMs: number;
}

export interface TicketTypes extends LifecycleTypes {
  record: TicketRecord;
  state: TicketState;
  parameters: TicketParameters;
  services: TicketServices;
}

export const TICKET_LIFECYCLE = 'ticketDesk';

export const TICKET_COLLECTION = 'tickets';

export const DEFAULT_REMIND_AFTER_MS = 24 * 60 * 60 * 1000;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** A transition hook's author falls back to the record's own party when the route omitted the name. */
function authorNameOf(
  context: TransitionHookContext<TicketTypes>,
  fallback: string | null,
): string {
  return text(context.input.authorName) || text(fallback) || context.actor.id;
}

/** Writes a person's words into the ticket's comment thread, in the transition's own transaction. */
async function appendComment(
  context: TransitionHookContext<TicketTypes>,
  kind: TicketCommentKind,
  body: string | null,
  fallbackAuthor: string | null,
): Promise<void> {
  const text_ = text(body);
  if (!text_) throw new Error(`A ${kind} must not be empty.`);

  const handle = context.transactionHandle as DatabaseConnection;
  await handle.repository<TicketCommentRow>('ticketComments').createOne({
    values: {
      ticketId: Number(context.record.id),
      authorId: context.actor.id,
      authorName: authorNameOf(context, fallbackAuthor),
      kind,
      body: text_,
      createdAt: context.now,
    },
  });
}

/** The story the requester and the desk read afterwards. */
async function recordTransitionWords(
  context: TransitionHookContext<TicketTypes>,
): Promise<void> {
  // `context.record` is the row as it was before this transition; the words to keep are the input it accepted.
  if (context.to === 'resolved') {
    await appendComment(
      context,
      'solution',
      text(context.input.resolution),
      context.record.assigneeName,
    );
    return;
  }
  if (context.from === 'resolved' && context.to === 'assigned') {
    await appendComment(
      context,
      'reason',
      text(context.input.reason),
      context.record.requesterName,
    );
  }
}

/**
 * `validate` runs before any guard and outside the request, so it answers with
 * a message *key*; the route that received the request translates it. Guards
 * do the same: they refuse with a key, and the route translates that too.
 */
function problem(field: string, message: string) {
  return [{ field, message }];
}

function notifyEffect(event: TicketNotificationEvent) {
  return defineEffect<TicketTypes>({
    name: `notify-${event}`,
    async run(context: EffectContext<TicketTypes>) {
      await context.services.notify(
        event,
        context.record,
        context.idempotencyKey,
      );
    },
  });
}

/** The desk, or the system: only these may decide other people's tickets. */
async function serviceDeskGuard(
  context: TransitionContext<TicketTypes>,
): Promise<GuardVerdict> {
  if (context.actor.system) return true;
  if (await context.services.isServiceDesk(context.actor.id)) return true;
  return { code: 'serviceDeskOnly', message: 'ticket.blocker.serviceDeskOnly' };
}

/** The engineer the ticket was handed to. */
function assigneeGuard(context: TransitionContext<TicketTypes>): GuardVerdict {
  if (context.actor.system) return true;
  if (context.actor.id === context.record.assigneeId) return true;
  return { code: 'assigneeOnly', message: 'ticket.blocker.assigneeOnly' };
}

/** The person who reported the issue. */
function requesterGuard(context: TransitionContext<TicketTypes>): GuardVerdict {
  if (context.actor.system) return true;
  if (context.actor.id === context.record.requesterId) return true;
  return { code: 'requesterOnly', message: 'ticket.blocker.requesterOnly' };
}

export const ticketLifecycle = defineLifecycle<TicketTypes>({
  name: TICKET_LIFECYCLE,
  collection: TICKET_COLLECTION,
  initial: 'pending',
  parameters: { remindAfterMs: DEFAULT_REMIND_AFTER_MS },
  states: [
    { name: 'pending', title: 'ticket.state.pending' },
    { name: 'assigned', title: 'ticket.state.assigned' },
    { name: 'resolved', title: 'ticket.state.resolved' },
    { name: 'closed', title: 'ticket.state.closed', final: true },
  ],
  create: {
    // Reporting an issue is open to every signed-in user; who may *decide* a
    // ticket is what the transitions guard.
    guard: () => true,
  },
  transitions: {
    /** The desk hands the ticket to an engineer. */
    assign: {
      title: 'ticket.transition.assign',
      from: ['pending', 'assigned'],
      to: 'assigned',
      accept: ['assigneeId', 'assigneeName'],
      guard: serviceDeskGuard,
      validate: (input) =>
        text(input.assigneeId)
          ? null
          : problem('assigneeId', 'ticket.problem.assigneeRequired'),
      set: async (context) => ({
        assignedAt: context.now,
        resolvedAt: null,
        closedAt: null,
        lastReason: null,
        remindedAt: null,
        updatedAt: context.now,
      }),
      onTransition: recordTransitionWords,
      effects: [notifyEffect('assigned')],
    },
    /** The engineer writes down what was wrong and what was done about it. */
    resolve: {
      title: 'ticket.transition.resolve',
      from: 'assigned',
      to: 'resolved',
      accept: ['resolution'],
      guard: assigneeGuard,
      validate: (input) =>
        text(input.resolution)
          ? null
          : problem('resolution', 'ticket.problem.resolutionRequired'),
      set: async (context) => ({
        resolvedAt: context.now,
        updatedAt: context.now,
      }),
      onTransition: recordTransitionWords,
      effects: [notifyEffect('resolved')],
    },
    /** The reporter accepts the fix. */
    confirm: {
      title: 'ticket.transition.confirm',
      from: 'resolved',
      to: 'closed',
      guard: requesterGuard,
      set: async (context) => ({
        closedAt: context.now,
        updatedAt: context.now,
      }),
      effects: [notifyEffect('confirmed')],
    },
    /** The reporter sends it back for more work. */
    return: {
      title: 'ticket.transition.return',
      from: 'resolved',
      to: 'assigned',
      guard: requesterGuard,
      validate: (input) =>
        text(input.reason)
          ? null
          : problem('reason', 'ticket.problem.reasonRequired'),
      // `reason` is not a record column; the record keeps it as `lastReason`.
      set: async (context) => ({
        lastReason: text(context.input.reason),
        resolvedAt: null,
        remindedAt: null,
        updatedAt: context.now,
      }),
      onTransition: recordTransitionWords,
      effects: [notifyEffect('returned')],
    },
    /**
     * A nudge about a ticket nobody has moved; only the 24-hour trigger fires
     * it. It stays in whichever open state it was in, so the reminder repeats
     * daily until someone acts.
     */
    remind: {
      title: 'ticket.transition.remind',
      from: ['pending', 'assigned'],
      to: ['pending', 'assigned'],
      manual: false,
      route: (context) => context.record.status,
      guard: () => true,
      set: async (context) => ({
        remindedAt: context.now,
        updatedAt: context.now,
      }),
      effects: [notifyEffect('reminder')],
    },
  },
  triggers: {
    reminder: {
      transition: 'remind',
      when: ['pending', 'assigned'],
      after: (parameters: TicketParameters) => parameters.remindAfterMs,
      batchSize: 100,
    },
  },
});

export type TicketLifecycle = typeof ticketLifecycle;
