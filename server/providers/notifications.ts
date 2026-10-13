/**
 * Delivers a ticket notification to the in-app inbox.
 *
 * The notification service is resolved lazily, on the first send: effects run long after every provider has
 * registered, and the notification plugin's provider is contributed by a plugin that may register after this
 * application's own providers. The effect's idempotency key travels to `send`, so an attempt repeated after a
 * timeout is deduplicated to one delivery per run.
 *
 * Text is bilingual plain strings, not translation keys: the inbox stores what was sent and the recipient's
 * language is unknown at send time. See `server/AGENTS.md`.
 */
import type { ServiceResolver } from '@nocobase/service-provider';
import {
  notificationServiceToken,
  type NotificationService,
} from '@nocobase/app-plugin-notification/server';
import type { TicketNotification } from '../lifecycles/tickets.js';

export type TicketNotifier = (
  notification: TicketNotification,
) => Promise<void>;

export function createTicketNotifier(
  container: ServiceResolver,
): TicketNotifier {
  return async (notification) => {
    if (notification.to.length === 0) return;
    if (!container.has(notificationServiceToken)) return;
    const notifications = container.resolve<NotificationService>(
      notificationServiceToken,
    );
    await notifications.send({
      idempotencyKey: notification.idempotencyKey,
      source: {
        type: 'serviceDeskTicket',
        referenceId: notification.referenceId,
      },
      messages: {
        inbox: {
          to: [...notification.to],
          title: notification.title,
          body: notification.body,
          target: { type: 'route', path: notification.path },
        },
      },
    });
  };
}
