/**
 * The `tickets` lifecycle: the state machine behind the repair workflow, from a submitted report to a confirmed
 * close. A self-transition reminds the service desk about a ticket nobody picked up after `overdueMs`.
 *
 * The state lives in `tickets.status`; the runtime owns `statusChangedAt` and `lifecycleVersion` too, so no service
 * or route may write those three fields directly. Guards decide by role — a service desk member, the assigned
 * engineer, or the employee who raised the ticket — through the services the runtime passes in, which read the
 * `serviceDeskStaff` table through the transition's own transaction.
 *
 * The three onEnter effects notify a person, and each runs after the transition commits, keyed by the run's
 * idempotency key, so a delivery attempted twice notifies once. Notification text is bilingual on purpose: the
 * inbox stores plain strings and the recipient's language is not known at send time; the application's own pages
 * are translated normally. See `server/AGENTS.md`.
 */
import {
  defineEffect,
  defineLifecycle,
  type EffectDefinition,
  type Lifecycle,
  type LifecycleRecord,
  type LifecycleTypes,
} from '@nocobase/lifecycle';

export const TICKET_LIFECYCLE = 'tickets';

export const TICKET_STATES = [
  'submitted',
  'assigned',
  'processing',
  'resolved',
  'returned',
  'closed',
  'cancelled',
] as const;

export type TicketState = (typeof TICKET_STATES)[number];

/** The open states that make a ticket count as overdue while it waits past `overdueMs`. */
export const TICKET_OPEN_STATES: readonly TicketState[] = [
  'submitted',
  'assigned',
  'processing',
  'returned',
];

export const TICKET_URGENCIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketUrgency = (typeof TICKET_URGENCIES)[number];

export interface TicketRecord extends LifecycleRecord {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly category: string | null;
  readonly location: string | null;
  readonly urgency: string;
  readonly status: TicketState;
  readonly statusChangedAt: string;
  readonly lifecycleVersion: number;
  readonly requesterId: string;
  readonly assigneeId: string | null;
  readonly solution: string | null;
  readonly returnReason: string | null;
  readonly attachmentIds: readonly string[] | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** What an effect asks the application to deliver, in the inbox's own terms. */
export interface TicketNotification {
  readonly idempotencyKey: string;
  readonly referenceId: string;
  readonly to: readonly string[];
  readonly title: string;
  readonly body: string;
  readonly path: string;
}

export interface TicketLifecycleServices {
  /** Whether the person is on the service desk, or an engineer, or neither (then only their own tickets). */
  readonly rolesOf: (
    userId: string,
  ) => Promise<{ readonly helpdesk: boolean; readonly engineer: boolean }>;
  /** Whether a user id is one of the engineers a ticket may be assigned to. */
  readonly engineerExists: (userId: string) => Promise<boolean>;
  /** Every service desk member's user id. */
  readonly helpdeskUserIds: () => Promise<readonly string[]>;
  readonly notify: (notification: TicketNotification) => Promise<void>;
}

export interface TicketParameters {
  /** How long a ticket may wait in an open state before the service desk is reminded. */
  readonly overdueMs: number;
}

export interface TicketLifecycleTypes extends LifecycleTypes {
  record: TicketRecord;
  state: TicketState;
  parameters: TicketParameters;
  services: TicketLifecycleServices;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** English first, then Chinese; see the file comment for why notification text is not translated per recipient. */
function bilingual(english: string, chinese: string): string {
  return `${english} / ${chinese}`;
}

function ticketTitle(
  record: TicketRecord,
  english: string,
  chinese: string,
): string {
  return bilingual(
    `Ticket #${record.id} ${english}`,
    `工单 #${record.id} ${chinese}`,
  );
}

function ticketBody(record: TicketRecord): string {
  const title = typeof record.title === 'string' ? record.title : '';
  return `${bilingual('Subject', '主题')}: ${title}`;
}

function notify(input: {
  readonly record: TicketRecord;
  readonly to: readonly string[];
  readonly title: string;
  readonly body: string;
  readonly idempotencyKey: string;
  readonly services: TicketLifecycleServices;
}): Promise<void> {
  if (input.to.length === 0) return Promise.resolve();
  return input.services.notify({
    idempotencyKey: input.idempotencyKey,
    referenceId: String(input.record.id),
    to: input.to,
    title: input.title,
    body: input.body,
    path: `/tickets/${input.record.id}`,
  });
}

const notifyAssignee = defineEffect<TicketLifecycleTypes>({
  name: 'notifyAssignee',
  timeoutMs: 30_000,
  async run({ record, to, services, idempotencyKey }) {
    if (!record.assigneeId) return;
    const returned = to === 'returned';
    await notify({
      record,
      to: [record.assigneeId],
      title: returned
        ? ticketTitle(
            record,
            'returned for further handling',
            '被退回，需要继续处理',
          )
        : ticketTitle(record, 'assigned to you', '已分配给你'),
      body: ticketBody(record),
      idempotencyKey,
      services,
    });
  },
});

const notifyRequester = defineEffect<TicketLifecycleTypes>({
  name: 'notifyRequester',
  timeoutMs: 30_000,
  async run({ record, services, idempotencyKey }) {
    await notify({
      record,
      to: [record.requesterId],
      title: ticketTitle(
        record,
        'is resolved — please confirm',
        '已解决 — 请确认',
      ),
      body: ticketBody(record),
      idempotencyKey,
      services,
    });
  },
});

const notifyHelpdesk = defineEffect<TicketLifecycleTypes>({
  name: 'notifyHelpdesk',
  timeoutMs: 30_000,
  async run({ record, services, idempotencyKey }) {
    await notify({
      record,
      to: await services.helpdeskUserIds(),
      title: ticketTitle(
        record,
        'has been open over 24 hours',
        '已超过 24 小时未关闭',
      ),
      body: ticketBody(record),
      idempotencyKey,
      services,
    });
  },
});

const overdueReminder: EffectDefinition<TicketLifecycleTypes> = notifyHelpdesk;

export const ticketLifecycle: Lifecycle<TicketLifecycleTypes> =
  defineLifecycle<TicketLifecycleTypes>({
    name: TICKET_LIFECYCLE,
    initial: 'submitted',
    parameters: { overdueMs: DAY_MS },
    create: {
      validate(values) {
        const problems: { field: string; message: string }[] = [];
        if (typeof values.title !== 'string' || values.title.trim() === '') {
          problems.push({
            field: 'title',
            message: bilingual('A subject is required.', '请填写主题。'),
          });
        }
        if (
          typeof values.description !== 'string' ||
          values.description.trim() === ''
        ) {
          problems.push({
            field: 'description',
            message: bilingual(
              'A description is required.',
              '请填写问题描述。',
            ),
          });
        }
        if (
          typeof values.urgency !== 'string' ||
          !TICKET_URGENCIES.includes(values.urgency as TicketUrgency)
        ) {
          problems.push({
            field: 'urgency',
            message: bilingual('An urgency is required.', '请选择紧急程度。'),
          });
        }
        return problems.length > 0 ? problems : null;
      },
      guard({ values, actor }) {
        if (!actor.id) {
          return {
            code: 'REQUIRES_SIGN_IN',
            message: bilingual(
              'Sign in to raise a ticket.',
              '请先登录再提交报修。',
            ),
          };
        }
        if (values.requesterId !== actor.id) {
          return {
            code: 'REQUESTER_MISMATCH',
            message: bilingual(
              'A ticket is raised as yourself.',
              '只能为自己提交报修。',
            ),
          };
        }
        return true;
      },
    },
    states: [
      { name: 'submitted', title: 'Submitted', meta: { tone: 'warning' } },
      { name: 'assigned', title: 'Assigned', meta: { tone: 'info' } },
      { name: 'processing', title: 'Processing', meta: { tone: 'info' } },
      { name: 'resolved', title: 'Resolved', meta: { tone: 'success' } },
      { name: 'returned', title: 'Returned', meta: { tone: 'warning' } },
      {
        name: 'closed',
        title: 'Closed',
        final: true,
        meta: { tone: 'neutral' },
      },
      {
        name: 'cancelled',
        title: 'Cancelled',
        final: true,
        meta: { tone: 'neutral' },
      },
    ],
    transitions: {
      assign: {
        title: 'Assign engineer',
        from: 'submitted',
        to: 'assigned',
        accept: ['assigneeId'],
        // `available()` asks a guard with no input, so the assignee check waits for a real choice; the guard
        // below withholds the transition from everyone but the service desk either way.
        async guard({ actor, input, services }) {
          const { helpdesk } = await services.rolesOf(actor.id);
          if (!helpdesk) {
            return {
              code: 'NOT_HELPDESK',
              message: bilingual(
                'Only the service desk may assign a ticket.',
                '只有服务台可以派单。',
              ),
            };
          }
          const assigneeId = input.assigneeId;
          if (
            typeof assigneeId === 'string' &&
            assigneeId !== '' &&
            !(await services.engineerExists(assigneeId))
          ) {
            return {
              code: 'NOT_ENGINEER',
              kind: 'precondition',
              message: bilingual(
                'That person is not an engineer.',
                '该人员不是工程师。',
              ),
            };
          }
          return true;
        },
        validate(input) {
          return typeof input.assigneeId === 'string' && input.assigneeId !== ''
            ? null
            : [
                {
                  field: 'assigneeId',
                  message: bilingual('Choose an engineer.', '请选择工程师。'),
                },
              ];
        },
        set: ({ now }) => ({ updatedAt: now }),
      },
      start: {
        title: 'Start handling',
        from: 'assigned',
        to: 'processing',
        async guard({ record, actor, services }) {
          if (record.assigneeId === actor.id) return true;
          const { helpdesk } = await services.rolesOf(actor.id);
          return helpdesk
            ? true
            : {
                code: 'NOT_ASSIGNEE',
                message: bilingual(
                  'Only the assigned engineer may start.',
                  '只有被指派的工程师可以开始处理。',
                ),
              };
        },
        set: ({ now }) => ({ updatedAt: now }),
      },
      resolve: {
        title: 'Resolve',
        from: ['assigned', 'processing'],
        to: 'resolved',
        accept: ['solution'],
        async guard({ record, actor, services }) {
          if (record.assigneeId === actor.id) return true;
          const { helpdesk } = await services.rolesOf(actor.id);
          return helpdesk
            ? true
            : {
                code: 'NOT_ASSIGNEE',
                message: bilingual(
                  'Only the assigned engineer or the service desk may resolve.',
                  '只有被指派的工程师或服务台可以解决。',
                ),
              };
        },
        validate(input) {
          return typeof input.solution === 'string' &&
            input.solution.trim() !== ''
            ? null
            : [
                {
                  field: 'solution',
                  message: bilingual(
                    'Describe the solution.',
                    '请填写解决方案。',
                  ),
                },
              ];
        },
        set: ({ now }) => ({ updatedAt: now }),
      },
      confirm: {
        title: 'Confirm and close',
        from: 'resolved',
        to: 'closed',
        guard({ record, actor }) {
          return record.requesterId === actor.id
            ? true
            : {
                code: 'NOT_REQUESTER',
                message: bilingual(
                  'Only the requester may confirm.',
                  '只有报修人可以确认。',
                ),
              };
        },
        set: ({ now }) => ({ updatedAt: now }),
      },
      return: {
        title: 'Return for further handling',
        from: 'resolved',
        to: 'returned',
        accept: ['returnReason'],
        guard({ record, actor }) {
          return record.requesterId === actor.id
            ? true
            : {
                code: 'NOT_REQUESTER',
                message: bilingual(
                  'Only the requester may return it.',
                  '只有报修人可以退回。',
                ),
              };
        },
        validate(input) {
          return typeof input.returnReason === 'string' &&
            input.returnReason.trim() !== ''
            ? null
            : [
                {
                  field: 'returnReason',
                  message: bilingual(
                    'Say what is still wrong.',
                    '请说明未解决的问题。',
                  ),
                },
              ];
        },
        set: ({ now }) => ({ updatedAt: now }),
      },
      rework: {
        title: 'Handle again',
        from: 'returned',
        to: 'processing',
        async guard({ record, actor, services }) {
          if (record.assigneeId === actor.id) return true;
          const { helpdesk } = await services.rolesOf(actor.id);
          return helpdesk
            ? true
            : {
                code: 'NOT_ASSIGNEE',
                message: bilingual(
                  'Only the assigned engineer may handle it again.',
                  '只有被指派的工程师可以重新处理。',
                ),
              };
        },
        set: ({ now }) => ({ updatedAt: now }),
      },
      reassign: {
        title: 'Assign another engineer',
        from: 'returned',
        to: 'assigned',
        accept: ['assigneeId'],
        async guard({ actor, input, services }) {
          const { helpdesk } = await services.rolesOf(actor.id);
          if (!helpdesk) {
            return {
              code: 'NOT_HELPDESK',
              message: bilingual(
                'Only the service desk may reassign.',
                '只有服务台可以改派。',
              ),
            };
          }
          const assigneeId = input.assigneeId;
          if (
            typeof assigneeId === 'string' &&
            assigneeId !== '' &&
            !(await services.engineerExists(assigneeId))
          ) {
            return {
              code: 'NOT_ENGINEER',
              kind: 'precondition',
              message: bilingual(
                'That person is not an engineer.',
                '该人员不是工程师。',
              ),
            };
          }
          return true;
        },
        validate(input) {
          return typeof input.assigneeId === 'string' && input.assigneeId !== ''
            ? null
            : [
                {
                  field: 'assigneeId',
                  message: bilingual('Choose an engineer.', '请选择工程师。'),
                },
              ];
        },
        set: ({ now }) => ({ updatedAt: now }),
      },
      cancel: {
        title: 'Cancel',
        from: ['submitted', 'assigned'],
        to: 'cancelled',
        accept: ['returnReason'],
        async guard({ record, actor, services }) {
          if (record.requesterId === actor.id) return true;
          const { helpdesk } = await services.rolesOf(actor.id);
          return helpdesk
            ? true
            : {
                code: 'NOT_REQUESTER',
                message: bilingual(
                  'Only the requester or the service desk may cancel.',
                  '只有报修人或服务台可以取消。',
                ),
              };
        },
        validate(input) {
          return typeof input.returnReason === 'string' &&
            input.returnReason.trim() !== ''
            ? null
            : [
                {
                  field: 'returnReason',
                  message: bilingual(
                    'Say why it is cancelled.',
                    '请填写取消原因。',
                  ),
                },
              ];
        },
        set: ({ now }) => ({ updatedAt: now }),
      },
      remindOverdue: {
        // Fired by the trigger below, never by a person. It stays in the same state and only resets the clock, so
        // the sweep reminds the service desk once per `overdueMs` while a ticket stays open.
        title: 'Remind the service desk',
        from: TICKET_OPEN_STATES,
        to: TICKET_OPEN_STATES,
        route: ({ record }) => record.status,
        manual: false,
        effects: [overdueReminder],
      },
    },
    onEnter: {
      assigned: [notifyAssignee],
      resolved: [notifyRequester],
      returned: [notifyAssignee],
    },
    triggers: {
      overdueReminder: {
        transition: 'remindOverdue',
        when: TICKET_OPEN_STATES,
        after: (parameters) => parameters.overdueMs,
      },
    },
  });

export default ticketLifecycle;
