import {
  defineEffect,
  defineLifecycle,
  type EffectContext,
  type Lifecycle,
  type LifecycleRecord,
  type LifecycleTypes,
  type SetContext,
} from '@nocobase/lifecycle';

/** The ticket states, in the order a ticket moves through them. */
export type TicketState = 'pending' | 'processing' | 'resolved' | 'closed';

export type TicketUrgency = 'normal' | 'urgent' | 'critical';

/** The business record the `tickets` lifecycle runs on. */
export interface Ticket extends LifecycleRecord {
  readonly status: TicketState;
  readonly title: string;
  readonly description: string;
  readonly urgency: TicketUrgency;
  readonly reporterId: string;
  readonly assigneeId: string | null;
  readonly handlingNote: string | null;
  readonly solution: string | null;
  readonly attachmentIds: string[] | null;
  readonly assignedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly returnedCount: number;
  readonly lastReturnReason: string | null;
  readonly remindedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** What an effect asks the notification service to deliver. */
export interface TicketNotification {
  readonly event: 'assigned' | 'resolved' | 'returned' | 'closed' | 'overdue';
  readonly ticket: Ticket;
  /** Stable per effect run: pass it to the external system so a retry delivers once. */
  readonly idempotencyKey: string;
}

export interface TicketNotifier {
  notify(input: TicketNotification): Promise<void>;
}

export interface TicketTypes extends LifecycleTypes {
  record: Ticket;
  state: TicketState;
  parameters: { reminderAfterMs: number };
  services: { notify: TicketNotifier };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function effectFor(
  event: TicketNotification['event'],
): ReturnType<typeof defineEffect<TicketTypes>> {
  return defineEffect<TicketTypes>({
    // Stored with every effect run: never rename casually.
    name: `tickets.notify.${event}`,
    retry: { attempts: 3, backoffMs: 5_000, factor: 2 },
    timeoutMs: 30_000,
    run: ({ record, services, idempotencyKey }: EffectContext<TicketTypes>) =>
      services.notify.notify({ event, ticket: record, idempotencyKey }),
  });
}

const notifyAssigned = effectFor('assigned');
const notifyResolved = effectFor('resolved');
const notifyReturned = effectFor('returned');
const notifyClosed = effectFor('closed');
const notifyOverdue = effectFor('overdue');

function requiredText(value: unknown, message: string) {
  return typeof value === 'string' && value.trim().length > 0
    ? []
    : [{ field: 'input', message }];
}

/**
 * The lifecycle owns `status`, `statusChangedAt` and `lifecycleVersion` only; `updatedAt` is nobody's, so every
 * transition writes it here, in the same statement as the state change.
 */
function touch(
  extra: (context: SetContext<TicketTypes>) => Record<string, unknown>,
) {
  return (context: SetContext<TicketTypes>) => ({
    updatedAt: context.now.toISOString(),
    ...extra(context),
  });
}

/**
 * The repair-ticket lifecycle. `status`, `statusChangedAt` and `lifecycleVersion` are the only fields it owns; every
 * other field is written by a transition's `accept` or `set`, so the state and its consequences commit together.
 */
export const ticketLifecycle: Lifecycle<TicketTypes> =
  defineLifecycle<TicketTypes>({
    name: 'tickets',
    initial: 'pending',
    states: [
      { name: 'pending', title: 'Pending assignment' },
      { name: 'processing', title: 'In progress' },
      { name: 'resolved', title: 'Awaiting confirmation' },
      { name: 'closed', title: 'Closed', final: true },
    ],
    parameters: { reminderAfterMs: DAY_MS },
    create: {
      validate: (values) => {
        const problems = [
          ...requiredText(values.title, 'A title is required.'),
          ...requiredText(values.description, 'A description is required.'),
          ...requiredText(values.reporterId, 'A reporter is required.'),
        ];
        return problems.length ? problems : null;
      },
    },
    transitions: {
      assign: {
        title: 'Assign',
        from: 'pending',
        to: 'processing',
        validate: (input) =>
          requiredText(input.assigneeId, 'Choose an engineer.'),
        accept: ['assigneeId'],
        set: touch(({ now }) => ({ assignedAt: now.toISOString() })),
        effects: [notifyAssigned],
      },
      reassign: {
        title: 'Reassign',
        from: 'processing',
        to: 'processing',
        validate: (input) =>
          requiredText(input.assigneeId, 'Choose an engineer.'),
        accept: ['assigneeId'],
        set: touch(({ now }) => ({ assignedAt: now.toISOString() })),
        effects: [notifyAssigned],
      },
      progress: {
        title: 'Record progress',
        from: 'processing',
        to: 'processing',
        validate: (input) =>
          requiredText(input.handlingNote, 'Describe what was done.'),
        accept: ['handlingNote'],
        set: touch(() => ({})),
      },
      resolve: {
        title: 'Resolve',
        from: 'processing',
        to: 'resolved',
        validate: (input) =>
          requiredText(input.solution, 'Describe the solution.'),
        accept: ['solution'],
        set: touch(({ now }) => ({ resolvedAt: now.toISOString() })),
        effects: [notifyResolved],
      },
      confirm: {
        title: 'Confirm',
        from: 'resolved',
        to: 'closed',
        set: touch(({ now }) => ({ closedAt: now.toISOString() })),
        effects: [notifyClosed],
      },
      return: {
        title: 'Return for further handling',
        from: 'resolved',
        to: 'processing',
        validate: (input) =>
          requiredText(
            input.lastReturnReason,
            'Explain why it is not resolved.',
          ),
        accept: ['lastReturnReason'],
        set: touch(({ record }) => ({
          returnedCount: (record.returnedCount ?? 0) + 1,
          resolvedAt: null,
          remindedAt: null,
        })),
        effects: [notifyReturned],
      },
      remind: {
        title: 'Remind the service desk',
        from: ['pending', 'processing'],
        to: ['pending', 'processing'],
        // A self-transition that keeps the ticket where it is; only the trigger fires it.
        route: ({ record }) => record.status,
        manual: false,
        set: touch(({ now }) => ({ remindedAt: now.toISOString() })),
        effects: [notifyOverdue],
      },
    },
    triggers: {
      remindStale: {
        transition: 'remind',
        when: ['pending', 'processing'],
        after: ({ reminderAfterMs }) => reminderAfterMs,
      },
    },
  });
