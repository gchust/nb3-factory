/**
 * In-app notifications for work-order activity.
 *
 * Delivery is best-effort and never inside the business transaction: a missing
 * or misconfigured channel must not make a state transition fail. The idempotency
 * key is derived from the transition so a retried request cannot deliver twice.
 */

import type { NotificationService } from '@nocobase/app-plugin-notification';

import { NOTIFICATION_CHANNEL } from './constants.js';

export interface NotificationMessage {
  readonly idempotencyKey: string;
  readonly workOrderId: string;
  readonly userIds: readonly string[];
  readonly title: string;
  readonly body: string;
  /** Application-internal route the notification opens. */
  readonly path: string;
}

export interface Notifier {
  send(message: NotificationMessage): Promise<void>;
}

export function createNotifier(notification: NotificationService): Notifier {
  return {
    async send(message: NotificationMessage): Promise<void> {
      const recipients = [...new Set(message.userIds.filter((id) => !!id))];
      if (recipients.length === 0) return;
      try {
        await notification.send({
          idempotencyKey: message.idempotencyKey,
          source: { type: 'workOrder', referenceId: message.workOrderId },
          messages: {
            [NOTIFICATION_CHANNEL]: {
              to:
                recipients.length === 1
                  ? recipients[0]
                  : (recipients as [string, ...string[]]),
              title: message.title,
              body: message.body,
              target: { type: 'route', path: message.path },
            },
          },
        });
      } catch {
        // A notification is a courtesy. The transition it reports has already
        // succeeded, so a delivery failure is logged by the notification
        // service and never surfaces as a failed work-order operation.
      }
    },
  };
}
