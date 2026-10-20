import {
  defineEffect,
  defineLifecycle,
  type EffectContext,
  type GuardVerdict,
  type TransitionContext,
} from '@nocobase/lifecycle';
import type {
  TicketNotificationTarget,
  TicketRecord,
  TicketState,
  TicketTypes,
} from './types.js';
import { translateTicket, translateTicketDefault } from './i18n.js';

const notifierTarget = (record: TicketRecord): TicketNotificationTarget => ({
  id: record.id,
  ticketNo: record.ticketNo,
  title: record.title,
  status: record.status,
  requesterId: record.requesterId,
});

const notifierEffect = (
  name: string,
  action: (
    ticket: TicketNotificationTarget,
    context: EffectContext<TicketTypes>,
  ) => Promise<void>,
) =>
  defineEffect<TicketTypes>({
    name,
    retry: {
      attempts: 5,
      backoffMs: 1_000,
      factor: 2,
      maxMs: 60_000,
    },
    async run(context) {
      await action(notifierTarget(context.record), context);
    },
  });

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const guardMessage = (
  context: TransitionContext<TicketTypes>,
  key: string,
): string =>
  translateTicket(
    context.services.translate,
    `helpdesk.lifecycle.guards.${key}`,
  );

const isEngineer = async (
  context: TransitionContext<TicketTypes>,
): Promise<boolean> =>
  context.services.people.hasRole(
    context.actor.id,
    context.services.roleKeys.engineer,
  );

const isServiceDesk = async (
  context: TransitionContext<TicketTypes>,
): Promise<boolean> =>
  context.services.people.hasRole(
    context.actor.id,
    context.services.roleKeys.serviceDesk,
  );

const isAdministrator = async (
  context: TransitionContext<TicketTypes>,
): Promise<boolean> =>
  context.actor.system === true ||
  (await context.services.people.isRoot(context.actor.id));

const serviceDeskOrAdministrator = async (
  context: TransitionContext<TicketTypes>,
  message: string,
): Promise<GuardVerdict> =>
  (await isServiceDesk(context)) || (await isAdministrator(context))
    ? true
    : { code: 'HELPDESK_ROLE_REQUIRED', message };

const assigneeOrServiceDesk = async (
  context: TransitionContext<TicketTypes>,
  message: string,
): Promise<GuardVerdict> =>
  context.record.assigneeId === context.actor.id ||
  (await isServiceDesk(context)) ||
  (await isAdministrator(context))
    ? true
    : { code: 'HELPDESK_ASSIGNEE_REQUIRED', message };

const requesterOrServiceDesk = async (
  context: TransitionContext<TicketTypes>,
  message: string,
): Promise<GuardVerdict> =>
  context.record.requesterId === context.actor.id ||
  (await isServiceDesk(context)) ||
  (await isAdministrator(context))
    ? true
    : { code: 'HELPDESK_REQUESTER_REQUIRED', message };

const requesterOrAdministrator = async (
  context: TransitionContext<TicketTypes>,
  message: string,
): Promise<GuardVerdict> =>
  context.record.requesterId === context.actor.id ||
  (await isAdministrator(context))
    ? true
    : { code: 'HELPDESK_ADMIN_REQUIRED', message };

const assignmentEffect = notifierEffect(
  'notify-assignee',
  async (ticket, context) => {
    const assigneeId =
      typeof context.record.assigneeId === 'string'
        ? context.record.assigneeId
        : typeof context.input.assigneeId === 'string'
          ? context.input.assigneeId
          : null;
    if (assigneeId) {
      await context.services.notifications.assigned(
        ticket,
        assigneeId,
        context.idempotencyKey,
      );
    }
  },
);

const startedEffect = notifierEffect(
  'notify-requester-started',
  async (ticket, context) => {
    await context.services.notifications.started(
      ticket,
      context.idempotencyKey,
    );
  },
);

const resolvedEffect = notifierEffect(
  'notify-requester-resolved',
  async (ticket, context) => {
    await context.services.notifications.resolved(
      ticket,
      String(context.record.requesterId),
      context.idempotencyKey,
    );
  },
);

const reopenedEffect = notifierEffect(
  'notify-requester-reopened',
  async (ticket, context) => {
    await context.services.notifications.reopened(
      ticket,
      String(context.record.requesterId),
      context.idempotencyKey,
    );
  },
);

const closedEffect = notifierEffect(
  'notify-requester-closed',
  async (ticket, context) => {
    await context.services.notifications.closed(
      ticket,
      String(context.record.requesterId),
      context.idempotencyKey,
    );
  },
);

const cancelledEffect = notifierEffect(
  'notify-requester-cancelled',
  async (ticket, context) => {
    await context.services.notifications.cancelled(
      ticket,
      String(context.record.requesterId),
      context.idempotencyKey,
    );
  },
);

const escalatedEffect = notifierEffect(
  'notify-service-desk-escalated',
  async (ticket, context) => {
    await context.services.notifications.escalated(
      ticket,
      context.idempotencyKey,
    );
  },
);

/**
 * The ticket workflow. Business transitions carry every policy guard; the
 * overdue and touch transitions are server-only and are never offered as
 * buttons or accepted from the public fire route.
 */
export const ticketsLifecycle = defineLifecycle<TicketTypes>({
  name: 'tickets',
  collection: 'tickets',
  stateField: 'status',
  changedAtField: 'statusChangedAt',
  versionField: 'lifecycleVersion',
  initial: 'pending',
  parameters: { overdueHours: 24 },
  states: [
    {
      name: 'pending',
      title: 'Pending',
      meta: { tone: 'warning' },
    },
    {
      name: 'processing',
      title: 'Processing',
      meta: { tone: 'info' },
    },
    {
      name: 'escalated',
      title: 'Escalated',
      meta: { tone: 'destructive' },
    },
    {
      name: 'resolved',
      title: 'Resolved',
      meta: { tone: 'success' },
    },
    {
      name: 'closed',
      title: 'Closed',
      // Reopen leaves this state, so it is not a final state in the lifecycle graph.
      meta: { tone: 'neutral' },
    },
    {
      name: 'cancelled',
      title: 'Cancelled',
      final: true,
      meta: { tone: 'neutral' },
    },
  ],
  create: {
    guard: async (context) =>
      context.values.requesterId === context.actor.id ||
      (await context.services.people.hasRole(
        context.actor.id,
        context.services.roleKeys.serviceDesk,
      )) ||
      (await context.services.people.isRoot(context.actor.id))
        ? true
        : {
            code: 'HELPDESK_REQUESTER_MISMATCH',
            message: translateTicket(
              context.services.translate,
              'helpdesk.lifecycle.guards.requesterMismatch',
            ),
          },
  },
  transitions: {
    claim: {
      title: 'Claim',
      from: 'pending',
      to: 'processing',
      meta: { action: 'claim', tone: 'default' },
      guard: async (context) => {
        if (!(await isEngineer(context))) {
          return {
            code: 'HELPDESK_ENGINEER_REQUIRED',
            message: guardMessage(context, 'engineerRequired'),
          };
        }
        if (context.record.assigneeId) {
          return {
            code: 'HELPDESK_ALREADY_ASSIGNED',
            kind: 'precondition',
            message: guardMessage(context, 'alreadyAssigned'),
          };
        }
        return true;
      },
      set: (context) => ({ assigneeId: context.actor.id }),
      effects: [startedEffect],
    },
    assign: {
      title: 'Assign',
      from: 'pending',
      to: 'processing',
      accept: ['assigneeId'],
      meta: { action: 'assign', requiresInput: true },
      guard: (context) =>
        serviceDeskOrAdministrator(
          context,
          guardMessage(context, 'serviceDeskAssign'),
        ),
      validate: (input) =>
        typeof input.assigneeId === 'string' &&
        input.assigneeId.trim().length > 0
          ? null
          : translateTicketDefault(
              'helpdesk.lifecycle.guards.engineerSelected',
            ),
      set: (context) => ({
        assigneeId: text(context.input.assigneeId),
      }),
      effects: [assignmentEffect],
    },
    start: {
      title: 'Start processing',
      from: 'pending',
      to: 'processing',
      accept: ['assigneeId'],
      meta: { action: 'start' },
      guard: (context) =>
        assigneeOrServiceDesk(
          context,
          guardMessage(context, 'assigneeOrServiceDeskStart'),
        ),
      set: (context) => ({
        assigneeId:
          context.record.assigneeId ??
          (typeof context.input.assigneeId === 'string'
            ? context.input.assigneeId
            : context.actor.id),
      }),
      effects: [startedEffect],
    },
    resolve: {
      title: 'Resolve',
      from: ['processing', 'escalated'],
      to: 'resolved',
      accept: ['resolution'],
      meta: { action: 'resolve', requiresInput: true },
      guard: (context) =>
        assigneeOrServiceDesk(
          context,
          guardMessage(context, 'assigneeOrServiceDeskResolve'),
        ),
      validate: (input) =>
        typeof input.resolution === 'string' &&
        input.resolution.trim().length > 0
          ? null
          : translateTicketDefault(
              'helpdesk.lifecycle.guards.resolutionRequired',
            ),
      set: (context) => ({
        resolution: text(context.input.resolution),
        resolvedAt: context.now,
        closedAt: null,
      }),
      effects: [resolvedEffect],
    },
    reopen: {
      title: 'Reopen',
      from: ['resolved', 'closed'],
      to: 'pending',
      // The reason is kept in the transition input and history. The ticket
      // table has no reopen-reason column, and accepted input is written to the
      // record, so accepting it here would fail the transition.
      meta: { action: 'reopen' },
      guard: (context) =>
        requesterOrServiceDesk(
          context,
          guardMessage(context, 'requesterReopen'),
        ),
      set: () => ({
        assigneeId: null,
        resolvedAt: null,
        closedAt: null,
        resolution: null,
        closeNote: null,
      }),
      effects: [reopenedEffect],
    },
    close: {
      title: 'Close',
      from: 'resolved',
      to: 'closed',
      accept: ['closeNote'],
      meta: { action: 'close', requiresInput: false },
      guard: (context) =>
        requesterOrAdministrator(
          context,
          guardMessage(context, 'requesterClose'),
        ),
      set: (context) => ({
        closedAt: context.now,
        closeNote:
          typeof context.input.closeNote === 'string'
            ? context.input.closeNote.trim() || null
            : null,
      }),
      effects: [closedEffect],
    },
    cancel: {
      title: 'Cancel',
      from: ['pending', 'processing', 'escalated'],
      to: 'cancelled',
      accept: ['cancelReason'],
      meta: { action: 'cancel', requiresInput: true },
      guard: (context) =>
        serviceDeskOrAdministrator(
          context,
          guardMessage(context, 'serviceDeskCancel'),
        ),
      validate: (input) =>
        typeof input.cancelReason === 'string' &&
        input.cancelReason.trim().length > 0
          ? null
          : translateTicketDefault(
              'helpdesk.lifecycle.guards.cancelReasonRequired',
            ),
      set: (context) => ({
        cancelReason: text(context.input.cancelReason),
      }),
      effects: [cancelledEffect],
    },
    escalate: {
      title: 'Escalate overdue ticket',
      from: 'processing',
      to: 'escalated',
      manual: false,
      meta: { action: 'escalate', tone: 'destructive' },
      guard: (context) =>
        context.actor.system
          ? true
          : {
              code: 'HELPDESK_SYSTEM_TRANSITION',
              message: guardMessage(context, 'systemEscalate'),
            },
      effects: [escalatedEffect],
    },
    touch: {
      title: 'Record activity',
      from: 'processing',
      to: 'processing',
      manual: false,
      meta: { action: 'touch' },
      guard: (context) =>
        context.actor.system
          ? true
          : {
              code: 'HELPDESK_SYSTEM_TRANSITION',
              message: guardMessage(context, 'systemTouch'),
            },
    },
  },
  triggers: {
    overdue: {
      transition: 'escalate',
      when: 'processing',
      after: (parameters) => parameters.overdueHours * 60 * 60 * 1000,
      batchSize: 100,
    },
  },
});

export const TICKET_TRANSITION_LABELS: Record<
  string,
  { en: string; 'zh-CN': string }
> = {
  claim: { en: 'Claim', 'zh-CN': '领取' },
  assign: { en: 'Assign', 'zh-CN': '分配' },
  start: { en: 'Start processing', 'zh-CN': '开始处理' },
  resolve: { en: 'Resolve', 'zh-CN': '解决' },
  reopen: { en: 'Reopen', 'zh-CN': '重新打开' },
  close: { en: 'Close', 'zh-CN': '关闭' },
  cancel: { en: 'Cancel', 'zh-CN': '取消' },
  escalate: { en: 'Escalate overdue ticket', 'zh-CN': '升级超时工单' },
  touch: { en: 'Record activity', 'zh-CN': '记录活动' },
};

export const TICKET_STATE_LABELS: Record<
  TicketState,
  { en: string; 'zh-CN': string }
> = {
  pending: { en: 'Pending', 'zh-CN': '待处理' },
  processing: { en: 'Processing', 'zh-CN': '处理中' },
  escalated: { en: 'Escalated', 'zh-CN': '已升级' },
  resolved: { en: 'Resolved', 'zh-CN': '已解决' },
  closed: { en: 'Closed', 'zh-CN': '已关闭' },
  cancelled: { en: 'Cancelled', 'zh-CN': '已取消' },
};
