import {
  defineEffect,
  defineLifecycle,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

import type { TicketNotifications } from './notifications.js';

/**
 * The ticket state machine: submitted → assigned → processing → resolved → closed, with a reopened resolution
 * returning to the engineer. The state lives on `tickets.status`; `statusChangedAt` drives the 24-hour overdue
 * reminder and `lifecycleVersion` makes every change conditional. `server/helpdesk/lifecycle-provider.ts` registers
 * this definition on the one application `LifecycleRuntime`.
 */

export type TicketState =
  'submitted' | 'assigned' | 'processing' | 'resolved' | 'closed';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Ticket extends LifecycleRecord {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string | null;
  readonly priority: TicketPriority;
  readonly status: TicketState;
  readonly statusChangedAt: string;
  readonly lifecycleVersion: number;
  readonly reporterId: string;
  readonly reporterName: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly resolution: string | null;
  readonly serviceDeskNote: string | null;
  readonly reopenReason: string | null;
  readonly reopenedCount: number;
  readonly screenshotIds: string[] | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly lastReminderAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TicketTypes {
  record: Ticket;
  state: TicketState;
  parameters: { overdueAfterMs: number };
  services: { notifications: TicketNotifications };
}

/** One day, the interval after which an untouched ticket reminds the service desk. */
export const OVERDUE_AFTER_MS = 24 * 60 * 60 * 1000;

const assigneeOnly = ({ record, actor }: TransitionContext<TicketTypes>) =>
  actor.id === record.assigneeId || {
    code: 'assigneeOnly',
    message: 'Only the engineer this ticket is assigned to can do this.',
  };

const reporterOnly = ({ record, actor }: TransitionContext<TicketTypes>) =>
  actor.id === record.reporterId || {
    code: 'reporterOnly',
    message: 'Only the person who reported this ticket can do this.',
  };

const notifyAssigned = defineEffect<TicketTypes>({
  name: 'helpdesk.ticket.assigned',
  retry: { attempts: 3, backoffMs: 1_000, factor: 2 },
  run: ({ record, services, idempotencyKey }) =>
    services.notifications.assigned(record, idempotencyKey),
});

const notifyProcessingStarted = defineEffect<TicketTypes>({
  name: 'helpdesk.ticket.processingStarted',
  retry: { attempts: 3, backoffMs: 1_000, factor: 2 },
  run: ({ record, services, idempotencyKey }) =>
    services.notifications.processingStarted(record, idempotencyKey),
});

const notifyResolved = defineEffect<TicketTypes>({
  name: 'helpdesk.ticket.resolved',
  retry: { attempts: 3, backoffMs: 1_000, factor: 2 },
  run: ({ record, services, idempotencyKey }) =>
    services.notifications.resolved(record, idempotencyKey),
});

const notifyReopened = defineEffect<TicketTypes>({
  name: 'helpdesk.ticket.reopened',
  retry: { attempts: 3, backoffMs: 1_000, factor: 2 },
  run: ({ record, services, idempotencyKey }) =>
    services.notifications.reopened(record, idempotencyKey),
});

const notifyConfirmed = defineEffect<TicketTypes>({
  name: 'helpdesk.ticket.confirmed',
  retry: { attempts: 3, backoffMs: 1_000, factor: 2 },
  run: ({ record, services, idempotencyKey }) =>
    services.notifications.confirmed(record, idempotencyKey),
});

const notifyOverdue = defineEffect<TicketTypes>({
  name: 'helpdesk.ticket.overdue',
  retry: { attempts: 3, backoffMs: 1_000, factor: 2 },
  run: ({ record, services, idempotencyKey }) =>
    services.notifications.overdue(record, idempotencyKey),
});

export const ticketLifecycle: Lifecycle<TicketTypes> =
  defineLifecycle<TicketTypes>({
    name: 'tickets',
    initial: 'submitted',
    states: [
      { name: 'submitted', title: 'Submitted' },
      { name: 'assigned', title: 'Assigned' },
      { name: 'processing', title: 'Processing' },
      { name: 'resolved', title: 'Resolved' },
      { name: 'closed', title: 'Closed', final: true },
    ],
    parameters: { overdueAfterMs: OVERDUE_AFTER_MS },
    create: {
      validate: (values) =>
        typeof values.title === 'string' && values.title.trim().length > 0
          ? null
          : [{ field: 'title', message: 'A title is required.' }],
      guard: ({ values, actor }) =>
        actor.id === values.reporterId || 'Submit a ticket for yourself only.',
    },
    transitions: {
      // The service desk picks the engineer. Reassigning an open ticket is the same transition.
      assign: {
        title: 'Assign',
        from: ['submitted', 'assigned', 'processing'],
        to: 'assigned',
        accept: [
          'assigneeId',
          'assigneeName',
          'priority',
          'category',
          'serviceDeskNote',
        ],
        validate: (input) =>
          typeof input.assigneeId === 'string' && input.assigneeId.length > 0
            ? null
            : [{ field: 'assigneeId', message: 'Choose an engineer.' }],
        effects: [notifyAssigned],
      },
      // The assigned engineer begins work.
      start: {
        title: 'Start processing',
        from: 'assigned',
        to: 'processing',
        guard: assigneeOnly,
        effects: [notifyProcessingStarted],
      },
      // The assigned engineer records what fixed the issue.
      resolve: {
        title: 'Record a resolution',
        from: ['assigned', 'processing'],
        to: 'resolved',
        guard: assigneeOnly,
        accept: ['resolution'],
        validate: (input) =>
          typeof input.resolution === 'string' &&
          input.resolution.trim().length > 0
            ? null
            : [{ field: 'resolution', message: 'Describe the resolution.' }],
        set: ({ now }) => ({ resolvedAt: now }),
        effects: [notifyResolved],
      },
      // The reporter accepts the resolution; nothing more is owed.
      confirm: {
        title: 'Confirm and close',
        from: 'resolved',
        to: 'closed',
        guard: reporterOnly,
        set: ({ now }) => ({ closedAt: now }),
        effects: [notifyConfirmed],
      },
      // The reporter sends the resolution back. It returns to the engineer that resolved it, or to the queue.
      reopen: {
        title: 'Return for further processing',
        from: 'resolved',
        to: ['processing', 'assigned'],
        route: ({ record }) => (record.assigneeId ? 'processing' : 'assigned'),
        guard: reporterOnly,
        accept: ['reopenReason'],
        validate: (input) =>
          typeof input.reopenReason === 'string' &&
          input.reopenReason.trim().length > 0
            ? null
            : [
                {
                  field: 'reopenReason',
                  message: 'Say what still needs work.',
                },
              ],
        set: ({ record, now }) => ({
          resolvedAt: null,
          closedAt: null,
          reopenedCount: (record.reopenedCount ?? 0) + 1,
          lastReminderAt: now,
        }),
        effects: [notifyReopened],
      },
      // Fired by the overdue trigger, never by a person. A self-transition so the 24-hour clock restarts.
      remindOverdue: {
        title: 'Remind the service desk',
        from: ['submitted', 'assigned', 'processing'],
        to: ['submitted', 'assigned', 'processing'],
        route: ({ record }) => record.status,
        manual: false,
        set: ({ now }) => ({ lastReminderAt: now }),
        effects: [notifyOverdue],
      },
    },
    triggers: {
      overdue: {
        transition: 'remindOverdue',
        when: ['submitted', 'assigned', 'processing'],
        after: ({ overdueAfterMs }) => overdueAfterMs,
        batchSize: 50,
      },
    },
  });
