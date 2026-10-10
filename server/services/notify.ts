import type { NotificationSendResult } from '@nocobase/app-plugin-notification/server';
import type { ServiceToken } from '@nocobase/service-provider';

import type { ServiceRuntime } from './context.js';
import type { ServiceOrderRow } from './types.js';

export interface InAppNotice {
  /** Stable key: a repeated request for the same key does not notify twice. */
  readonly idempotencyKey: string;
  /** Business record the notice is about, used by the notification store. */
  readonly referenceId?: string;
  readonly referenceType?: string;
  /** Recipient user ids. An empty list is a no-op. */
  readonly to: readonly string[];
  readonly title: string;
  readonly body: string;
  /** Application route to open from the inbox message. */
  readonly path?: string;
}

export type InAppNoticeOutcome =
  | {
      readonly sent: true;
      readonly deduplicated: boolean;
      readonly notificationId: string;
    }
  | { readonly sent: false; readonly reason: string };

/**
 * Sends one in-app notification generation.
 *
 * Notifications are a best-effort side effect: a notifier that is temporarily
 * unavailable must not fail the business action that raised it, so a delivery
 * problem is recorded and reported rather than thrown. The stable
 * `idempotencyKey` is what makes a retried business action safe — the
 * notification service itself refuses to deliver a key twice with the same
 * content.
 */
export async function sendInAppNotice(
  runtime: ServiceRuntime,
  notice: InAppNotice,
): Promise<InAppNoticeOutcome> {
  if (notice.to.length === 0) {
    return { sent: false, reason: 'no_recipients' };
  }
  if (!runtime.notification) {
    return { sent: false, reason: 'notification_service_unavailable' };
  }
  const message: Record<string, unknown> = {
    to: [...notice.to],
    title: notice.title,
    body: notice.body,
  };
  if (notice.path) {
    message.target = { type: 'route', path: notice.path };
  }
  try {
    const result: NotificationSendResult = await runtime.notification.send({
      idempotencyKey: notice.idempotencyKey,
      source: {
        type: notice.referenceType ?? 'service-order',
        ...(notice.referenceId ? { referenceId: notice.referenceId } : {}),
      },
      messages: { inbox: message },
    });
    return {
      sent: true,
      deduplicated: result.deduplicated,
      notificationId: result.notificationId,
    };
  } catch (error) {
    runtime.logger?.warn?.(
      { error, idempotencyKey: notice.idempotencyKey },
      'In-app notification was not delivered',
    );
    return {
      sent: false,
      reason:
        error instanceof Error ? error.message : 'notification_send_failed',
    };
  }
}

interface PermissionAssignmentRow {
  subjectType: string;
  subjectId: string;
  permissionSetKey: string;
}

/**
 * User ids holding the `service.supervisor` permission set.
 *
 * Resolved from the permission-set assignments rather than a hardcoded
 * account, so the set of supervisors stays a management decision. The
 * duplicate-free list is ordered for a stable notification payload.
 */
export async function supervisorUserIds(
  runtime: ServiceRuntime,
): Promise<string[]> {
  const assignments = runtime.database.repository<PermissionAssignmentRow>(
    'authorizationPermissionSetAssignments',
  );
  const rows = await assignments.findMany({
    filter: (filter) =>
      filter.and([
        filter.string('subjectType').eq('user'),
        filter.string('permissionSetKey').eq('service.supervisor'),
      ]),
  });
  return [...new Set(rows.map((row) => row.subjectId))];
}

/**
 * The facts an acceptance notice is built from. A structural subset of
 * `AcceptOrderResult`, so both the HTTP service and the workflow notifier can
 * supply it.
 */
export interface AcceptanceNoticeFacts {
  readonly orderId: number;
  readonly orderNo: string;
  readonly title: string;
  readonly accepted: boolean;
  readonly assigneeId: string | null;
  readonly acceptanceNote: string | null;
  readonly reason: string;
}

export type AcceptanceNoticeOutcome =
  | {
      readonly sent: true;
      readonly deduplicated: boolean;
      readonly notificationId: string;
      readonly recipients: readonly string[];
    }
  | {
      readonly sent: false;
      readonly reason: string;
      readonly recipients: readonly string[];
    };

/**
 * Reports an acceptance outcome to the assignee or the supervisors.
 *
 * This is the application-side delivery of the same notice the workflow's
 * notification node sends, and it uses the workflow's idempotency key. When the
 * workflow already delivered the message the notification service reports it as
 * deduplicated instead of sending a second copy, so the acceptance is reported
 * exactly once whether automation is enabled or the direct transition ran. A
 * transition that changed nothing (`already_processed`) sends nothing.
 */
export async function notifyAcceptanceOutcome(
  runtime: ServiceRuntime,
  result: AcceptanceNoticeFacts,
): Promise<AcceptanceNoticeOutcome> {
  if (
    result.reason === 'already_processed' ||
    result.reason === 'order_not_found'
  ) {
    return {
      sent: false,
      reason: 'no_notification_required',
      recipients: [],
    };
  }
  let to: string[];
  if (result.accepted && result.assigneeId) {
    to = [result.assigneeId];
  } else {
    to = await supervisorUserIds(runtime);
  }
  const title = result.accepted
    ? 'Service order accepted'
    : 'Service order needs attention';
  const body = result.accepted
    ? `${result.orderNo} ${result.title} was accepted and is now pending processing.${
        result.acceptanceNote ? ` ${result.acceptanceNote}` : ''
      }`
    : `${result.orderNo} ${result.title} was not accepted automatically (${result.reason}).`;
  const outcome = await sendInAppNotice(runtime, {
    idempotencyKey: `order-acceptance-notice:${result.orderId}:${result.reason}`,
    referenceId: String(result.orderId),
    to,
    title,
    body,
    path: `/orders/${result.orderId}`,
  });
  if (outcome.sent) {
    return {
      sent: true,
      deduplicated: outcome.deduplicated,
      notificationId: outcome.notificationId,
      recipients: to,
    };
  }
  return { sent: false, reason: outcome.reason, recipients: to };
}

/**
 * The acceptance notification capability a workflow run handler calls.
 *
 * The handler is materialized into its own artifact that cannot resolve
 * application source or third-party packages, so the application registers this
 * implementation under `acceptanceNotifierServiceToken` and the handler only
 * mirrors the token and this interface. The whole notice decision — recipient,
 * wording and idempotency key — stays here with the HTTP service, so both paths
 * produce the same message.
 */
export interface AcceptanceNotifier {
  notifyAcceptance(
    input: AcceptanceNoticeFacts,
  ): Promise<AcceptanceNotificationResult>;
}

/** The compact outcome the workflow run records for its notification node. */
export interface AcceptanceNotificationResult {
  readonly notified: boolean;
  readonly recipients: readonly string[];
  readonly reason: string;
}

/** Builds the notifier the workflow's `notifyAcceptance` node resolves. */
export function createAcceptanceNotifier(
  runtime: ServiceRuntime,
): AcceptanceNotifier {
  return {
    async notifyAcceptance(input) {
      const outcome = await notifyAcceptanceOutcome(runtime, input);
      return {
        notified: outcome.sent,
        recipients: outcome.recipients,
        reason: outcome.sent
          ? outcome.deduplicated
            ? 'deduplicated'
            : 'sent'
          : outcome.reason,
      };
    },
  };
}

/**
 * Gives the application container and a workflow run handler the same token.
 *
 * The handler is materialized into its own artifact and cannot import this
 * module or `@nocobase/service-provider`, so `Symbol.for` names one registry
 * slot across both copies and `globalThis` holds the single token object they
 * then agree on. Keep the key and the mirror in
 * `workflows/order-acceptance/server/notify-acceptance.ts` in sync.
 */
const ACCEPTANCE_NOTIFIER_TOKEN_KEY = Symbol.for(
  'nb3-factory.service-acceptance-notifier',
);

interface AcceptanceNotifierTokenRegistry {
  acceptanceNotifier?: ServiceToken<AcceptanceNotifier>;
}

const acceptanceNotifierTokenRegistry = globalThis as unknown as Record<
  symbol,
  AcceptanceNotifierTokenRegistry | undefined
>;
const acceptanceNotifierTokens = (acceptanceNotifierTokenRegistry[
  ACCEPTANCE_NOTIFIER_TOKEN_KEY
] ??= {});

export const acceptanceNotifierServiceToken: ServiceToken<AcceptanceNotifier> =
  acceptanceNotifierTokens.acceptanceNotifier ??
  (acceptanceNotifierTokens.acceptanceNotifier = {
    name: 'app/service-acceptance-notifier',
  } as ServiceToken<AcceptanceNotifier>);

/** Tells the supervisors an order is waiting for their confirmation. */
export async function notifyOrderSubmitted(
  runtime: ServiceRuntime,
  order: ServiceOrderRow,
): Promise<InAppNoticeOutcome> {
  const to = await supervisorUserIds(runtime);
  return sendInAppNotice(runtime, {
    idempotencyKey: `order-submitted:${order.id}:${order.submittedAt ?? order.updatedAt}`,
    referenceId: String(order.id),
    to,
    title: 'Service order awaiting confirmation',
    body: `${order.orderNo} ${order.title} was submitted for confirmation.`,
    path: `/orders/${order.id}`,
  });
}

/** Tells the assignee an order came back for further work. */
export async function notifyOrderReturned(
  runtime: ServiceRuntime,
  order: ServiceOrderRow,
): Promise<InAppNoticeOutcome> {
  const to = order.assigneeId ? [order.assigneeId] : [];
  return sendInAppNotice(runtime, {
    idempotencyKey: `order-returned:${order.id}:${order.updatedAt}`,
    referenceId: String(order.id),
    to,
    title: 'Service order returned',
    body: `${order.orderNo} ${order.title} was returned for further work.${
      order.returnReason ? ` ${order.returnReason}` : ''
    }`,
    path: `/orders/${order.id}`,
  });
}
