import {
  defineEffect,
  defineLifecycle,
  type LifecycleActor,
  type LifecycleRecord,
  type LifecycleTypes,
  type ParameterGroup,
} from '@nocobase/lifecycle';

/** The four stages a helpdesk ticket moves through. */
export type TicketState = 'open' | 'processing' | 'resolved' | 'closed';

/** The stored ticket row. Only the fields the lifecycle itself reads are typed. */
export interface TicketRecord extends LifecycleRecord {
  readonly ticketNo: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly priority: string;
  readonly status: string;
  readonly statusChangedAt: string;
  readonly lifecycleVersion: number;
  readonly reporterId: string;
  readonly assigneeId?: string | null;
  readonly resolution?: string | null;
  readonly resolvedAt?: string | null;
  readonly closedAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** What the lifecycle may write, in addition to the fields it always writes. */
export interface HelpdeskLifecycleServices {
  readonly helpdesk: {
    addComment(input: {
      readonly ticketId: string;
      readonly authorId: string | null;
      readonly kind: 'system' | 'comment';
      readonly body: string;
    }): Promise<void>;
    notify(input: {
      readonly recipients: readonly string[];
      readonly titleKey: string;
      readonly bodyKey: string;
      readonly variables: Readonly<Record<string, string | number>>;
      readonly path: string;
      readonly idempotencyKey: string;
      readonly source: { readonly type: string; readonly referenceId: string };
    }): Promise<void>;
    serviceDeskRecipientIds(): Promise<readonly string[]>;
  };
}

export interface HelpdeskLifecycleTypes extends LifecycleTypes {
  record: TicketRecord;
  state: TicketState;
  parameters: { readonly reminderHours: number };
  services: HelpdeskLifecycleServices;
}

const isReporter = (record: TicketRecord, actor: LifecycleActor): boolean =>
  actor.system === true || actor.id === record.reporterId;

const isAssignee = (record: TicketRecord, actor: LifecycleActor): boolean =>
  actor.system === true || actor.id === record.assigneeId;

const requiredText = (
  value: unknown,
  field: string,
  label: string,
): string | null => {
  if (typeof value !== 'string' || value.trim() === '') {
    return `${label} is required`;
  }
  if (value.trim().length > 20000) return `${field} is too long`;
  return null;
};

const addSystemComment = async (
  context: {
    readonly record: TicketRecord;
    readonly actor: LifecycleActor;
    readonly services: HelpdeskLifecycleServices;
  },
  body: string,
): Promise<void> => {
  await context.services.helpdesk.addComment({
    ticketId: String(context.record.id),
    authorId: context.actor.system ? null : context.actor.id,
    kind: 'system',
    body,
  });
};

const notifyAssignee = defineEffect<HelpdeskLifecycleTypes>({
  name: 'helpdesk.ticket.notifyAssignee',
  retry: { attempts: 4, backoffMs: 2_000, factor: 2, maxMs: 60_000 },
  async run({ record, services, idempotencyKey, transition }) {
    const assigneeId = record.assigneeId;
    if (!assigneeId) return { skipped: 'no-assignee' };
    await services.helpdesk.notify({
      recipients: [String(assigneeId)],
      titleKey:
        transition === 'reassign'
          ? 'helpdesk.notifications.reassigned.title'
          : 'helpdesk.notifications.assigned.title',
      bodyKey:
        transition === 'reassign'
          ? 'helpdesk.notifications.reassigned.body'
          : 'helpdesk.notifications.assigned.body',
      variables: {
        ticketNo: record.ticketNo,
        title: record.title,
        priority: record.priority,
      },
      path: `/helpdesk/tickets/${String(record.id)}`,
      idempotencyKey,
      source: { type: 'helpdesk.ticket', referenceId: String(record.id) },
    });
    return { notified: String(assigneeId) };
  },
});

const notifyReporter = defineEffect<HelpdeskLifecycleTypes>({
  name: 'helpdesk.ticket.notifyReporter',
  retry: { attempts: 4, backoffMs: 2_000, factor: 2, maxMs: 60_000 },
  async run({ record, services, idempotencyKey }) {
    await services.helpdesk.notify({
      recipients: [record.reporterId],
      titleKey: 'helpdesk.notifications.resolved.title',
      bodyKey: 'helpdesk.notifications.resolved.body',
      variables: {
        ticketNo: record.ticketNo,
        title: record.title,
        resolution: record.resolution ?? '',
      },
      path: `/helpdesk/tickets/${String(record.id)}`,
      idempotencyKey,
      source: { type: 'helpdesk.ticket', referenceId: String(record.id) },
    });
    return { notified: record.reporterId };
  },
});

const notifyProgress = defineEffect<HelpdeskLifecycleTypes>({
  name: 'helpdesk.ticket.notifyProgress',
  retry: { attempts: 4, backoffMs: 2_000, factor: 2, maxMs: 60_000 },
  async run({ record, services, input, idempotencyKey }) {
    const serviceDesk = await services.helpdesk.serviceDeskRecipientIds();
    const recipients = [
      ...new Set([record.reporterId, ...serviceDesk].filter(Boolean)),
    ];
    if (!recipients.length) return { skipped: 'no-recipient' };
    await services.helpdesk.notify({
      recipients,
      titleKey: 'helpdesk.notifications.progress.title',
      bodyKey: 'helpdesk.notifications.progress.body',
      variables: {
        ticketNo: record.ticketNo,
        title: record.title,
        note: typeof input.progressNote === 'string' ? input.progressNote : '',
      },
      path: `/helpdesk/tickets/${String(record.id)}`,
      idempotencyKey,
      source: { type: 'helpdesk.ticket', referenceId: String(record.id) },
    });
    return { notified: recipients };
  },
});

const notifyReturned = defineEffect<HelpdeskLifecycleTypes>({
  name: 'helpdesk.ticket.notifyReturned',
  retry: { attempts: 4, backoffMs: 2_000, factor: 2, maxMs: 60_000 },
  async run({ record, services, idempotencyKey, input }) {
    if (!record.assigneeId) return { skipped: 'no-assignee' };
    await services.helpdesk.notify({
      recipients: [String(record.assigneeId)],
      titleKey: 'helpdesk.notifications.returned.title',
      bodyKey: 'helpdesk.notifications.returned.body',
      variables: {
        ticketNo: record.ticketNo,
        title: record.title,
        reason: typeof input.reason === 'string' ? input.reason : '',
      },
      path: `/helpdesk/tickets/${String(record.id)}`,
      idempotencyKey,
      source: { type: 'helpdesk.ticket', referenceId: String(record.id) },
    });
    return { notified: String(record.assigneeId) };
  },
});

const notifyClosed = defineEffect<HelpdeskLifecycleTypes>({
  name: 'helpdesk.ticket.notifyClosed',
  retry: { attempts: 4, backoffMs: 2_000, factor: 2, maxMs: 60_000 },
  async run({ record, services, idempotencyKey }) {
    if (!record.assigneeId) return { skipped: 'no-assignee' };
    await services.helpdesk.notify({
      recipients: [String(record.assigneeId)],
      titleKey: 'helpdesk.notifications.closed.title',
      bodyKey: 'helpdesk.notifications.closed.body',
      variables: { ticketNo: record.ticketNo, title: record.title },
      path: `/helpdesk/tickets/${String(record.id)}`,
      idempotencyKey,
      source: { type: 'helpdesk.ticket', referenceId: String(record.id) },
    });
    return { notified: String(record.assigneeId) };
  },
});

const notifyOverdue = defineEffect<HelpdeskLifecycleTypes>({
  name: 'helpdesk.ticket.notifyOverdue',
  retry: { attempts: 3, backoffMs: 5_000, factor: 2, maxMs: 60_000 },
  async run({ record, services, parameters, idempotencyKey }) {
    // The reminder belongs to the service desk: it is their queue that has to
    // notice a ticket sitting too long, and the assignee may already be blocked
    // on the same work.
    const recipients = [
      ...new Set(
        (await services.helpdesk.serviceDeskRecipientIds()).filter(Boolean),
      ),
    ];
    if (!recipients.length) return { skipped: 'no-recipient' };
    await services.helpdesk.notify({
      recipients,
      titleKey: 'helpdesk.notifications.overdue.title',
      bodyKey: 'helpdesk.notifications.overdue.body',
      variables: {
        ticketNo: record.ticketNo,
        title: record.title,
        hours: parameters.reminderHours,
      },
      path: `/helpdesk/tickets/${String(record.id)}`,
      idempotencyKey,
      source: { type: 'helpdesk.ticket', referenceId: String(record.id) },
    });
    return { notified: recipients };
  },
});

/**
 * The ticket lifecycle. Every guard answers from the stored record and the
 * actor alone, because `available()` may ask it without the input a later
 * `fire()` carries.
 */
/** Scope the application's lifecycle configuration groups are stored under. */
export const HELPDESK_PARAMETER_SCOPE = 'default';

/** Administrator-owned reminder policy, declared once for runtime and editors. */
export const HELPDESK_REMINDER_POLICY = {
  key: 'reminderPolicy',
  title: 'Overdue reminder policy',
  schemaVersion: 1,
  fields: {
    reminderHours: {
      type: 'number',
      title: 'Remind after (hours)',
      parse(value: unknown) {
        const hours = typeof value === 'number' ? value : Number(value);
        if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
          throw new Error(
            'Reminder hours must be a whole number between 1 and 720.',
          );
        }
        return hours;
      },
      bindings: [{ state: 'processing' }],
    },
  },
} satisfies ParameterGroup;

/**
 * The ticket lifecycle. Every guard answers from the stored record and the
 * actor alone, because `available()` may ask it without the input a later
 * `fire()` carries.
 */
export const helpdeskTicketLifecycle = defineLifecycle<HelpdeskLifecycleTypes>({
  name: 'helpdeskTicket',
  collection: 'helpdeskTickets',
  stateField: 'status',
  changedAtField: 'statusChangedAt',
  versionField: 'lifecycleVersion',
  initial: 'open',
  parameters: { reminderHours: 24 },
  // Administrator-owned policy: a processing ticket that has not moved for
  // this long receives the system `remind` transition. `readMode: 'live'`
  // makes every transition and trigger sweep read the current saved version.
  parameterConfiguration: {
    readMode: 'live',
    groups: [HELPDESK_REMINDER_POLICY],
  },
  create: {
    validate(values) {
      return (
        requiredText(values.title, 'title', 'Ticket title') ??
        requiredText(values.description, 'description', 'Description') ??
        requiredText(values.category, 'category', 'Category') ??
        requiredText(values.priority, 'priority', 'Priority') ??
        requiredText(values.reporterId, 'reporterId', 'Reporter')
      );
    },
    guard({ actor }) {
      return actor.system === true || Boolean(actor.id)
        ? true
        : 'A signed-in person is required to create a ticket';
    },
  },
  states: [
    {
      name: 'open',
      title: 'Open',
      meta: { tone: 'warning', icon: 'inbox' },
    },
    {
      name: 'processing',
      title: 'Processing',
      meta: { tone: 'info', icon: 'loader' },
    },
    {
      name: 'resolved',
      title: 'Resolved',
      meta: { tone: 'success', icon: 'check' },
    },
    {
      name: 'closed',
      title: 'Closed',
      final: true,
      meta: { tone: 'neutral', icon: 'lock' },
    },
  ],
  transitions: {
    assign: {
      title: 'Assign',
      from: 'open',
      to: 'processing',
      accept: ['assigneeId'],
      meta: { action: 'assign', tone: 'primary', confirm: false },
      validate(input) {
        return requiredText(input.assigneeId, 'assigneeId', 'Assignee');
      },
      guard({ record, actor }) {
        return record.assigneeId && !isAssignee(record, actor)
          ? 'This ticket is already assigned to someone else'
          : true;
      },
      async set({ now }) {
        return {
          resolvedAt: null,
          closedAt: null,
          updatedAt: now.toISOString(),
        };
      },
      async onTransition({ record, actor, services }) {
        await addSystemComment(
          { record, actor, services },
          'Ticket assigned to an engineer',
        );
      },
      effects: [notifyAssignee],
    },
    reassign: {
      title: 'Reassign',
      from: 'processing',
      to: 'processing',
      accept: ['assigneeId'],
      meta: { action: 'assign', tone: 'secondary', confirm: true },
      validate(input) {
        return requiredText(input.assigneeId, 'assigneeId', 'Assignee');
      },
      async set({ now }) {
        return { updatedAt: now.toISOString() };
      },
      async onTransition({ record, previous, actor, services }) {
        await addSystemComment(
          { record, actor, services },
          previous.assigneeId === record.assigneeId
            ? 'Ticket assignment confirmed'
            : 'Ticket reassigned to another engineer',
        );
      },
      effects: [notifyAssignee],
    },
    progress: {
      title: 'Record progress',
      from: 'processing',
      to: 'processing',
      // The note stays in the transition history and the generated comment;
      // it is not a column on the ticket record.
      meta: { action: 'progress', tone: 'secondary', confirm: false },
      validate(input) {
        return requiredText(
          input.progressNote,
          'progressNote',
          'Progress note',
        );
      },
      async set({ now }) {
        return { updatedAt: now.toISOString() };
      },
      async onTransition({ record, actor, input, services }) {
        const note =
          typeof input.progressNote === 'string' ? input.progressNote : '';
        await addSystemComment({ record, actor, services }, note);
      },
      effects: [notifyProgress],
    },
    resolve: {
      title: 'Resolve',
      from: 'processing',
      to: 'resolved',
      accept: ['resolution'],
      meta: { action: 'resolve', tone: 'success', confirm: true },
      validate(input) {
        return requiredText(input.resolution, 'resolution', 'Resolution');
      },
      guard({ record, actor }) {
        return isAssignee(record, actor)
          ? true
          : 'Only the assigned engineer or a system process may resolve this ticket';
      },
      async set({ now }) {
        return {
          resolvedAt: now.toISOString(),
          closedAt: null,
          updatedAt: now.toISOString(),
        };
      },
      async onTransition({ record, actor, services }) {
        await addSystemComment(
          { record, actor, services },
          `Resolved: ${record.resolution ?? ''}`,
        );
      },
      effects: [notifyReporter],
    },
    confirm: {
      title: 'Confirm resolution',
      from: 'resolved',
      to: 'closed',
      meta: { action: 'confirm', tone: 'success', confirm: true },
      guard({ record, actor }) {
        return isReporter(record, actor) || actor.system === true
          ? true
          : 'Only the reporter or a system process may confirm this resolution';
      },
      async set({ now }) {
        return { closedAt: now.toISOString(), updatedAt: now.toISOString() };
      },
      async onTransition({ record, actor, services }) {
        await addSystemComment(
          { record, actor, services },
          'Resolution confirmed',
        );
      },
      effects: [notifyClosed],
    },
    return: {
      title: 'Return to processing',
      from: 'resolved',
      to: 'processing',
      // Like a progress note, the reason is captured in history, not a column.
      meta: { action: 'return', tone: 'warning', confirm: true },
      validate(input) {
        return requiredText(input.reason, 'reason', 'Reason');
      },
      guard({ record, actor }) {
        return isReporter(record, actor) || actor.system === true
          ? true
          : 'Only the reporter or a system process may reopen this ticket';
      },
      async set({ now }) {
        return {
          resolvedAt: null,
          closedAt: null,
          updatedAt: now.toISOString(),
        };
      },
      async onTransition({ record, actor, input, services }) {
        const reason = typeof input.reason === 'string' ? input.reason : '';
        await addSystemComment(
          { record, actor, services },
          `Reopened: ${reason}`,
        );
      },
      effects: [notifyReturned],
    },
    remind: {
      title: 'Send overdue reminder',
      from: 'processing',
      to: 'processing',
      manual: false,
      meta: { action: 'remind', tone: 'warning', confirm: false },
      async set({ now, actor }) {
        return {
          lastReminderAt: actor.system ? now.toISOString() : null,
          updatedAt: now.toISOString(),
        };
      },
      async onTransition({ record, actor, services, parameters }) {
        await addSystemComment(
          { record, actor, services },
          `Overdue reminder sent after ${parameters.reminderHours} hour(s) without a state change`,
        );
      },
      effects: [notifyOverdue],
    },
  },
});
