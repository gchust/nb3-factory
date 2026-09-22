import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import {
  notificationServiceToken,
  type NotificationService,
} from '@nocobase/app-plugin-notification/server';

export interface ServiceNotificationInput {
  userId: string;
  title: string;
  body: string;
  actionUrl?: string;
  idempotencyKey: string;
  source?: { type: string; referenceId: string };
}

/**
 * Sends one durable in-app notification and never lets a delivery problem break
 * the business transaction that triggered it. The idempotency key is derived
 * from the business event so a retry does not duplicate the inbox item.
 */
export async function notifyUser(
  app: Application,
  input: ServiceNotificationInput,
): Promise<boolean> {
  try {
    if (!app.container.has(notificationServiceToken)) return false;
    const notification = app.container.resolve<NotificationService>(
      notificationServiceToken,
    );
    await notification.send({
      idempotencyKey: input.idempotencyKey,
      ...(input.source ? { source: input.source } : {}),
      to: { type: 'user', id: input.userId },
      channels: ['in-app'],
      content: {
        title: input.title,
        body: input.body,
        ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
      },
    });
    return true;
  } catch (error) {
    if (app.container.has(loggingToken)) {
      app.container
        .resolve(loggingToken)
        .getLogger()
        .warn(
          { error: (error as Error).message, userId: input.userId },
          'Service notification could not be sent',
        );
    }
    return false;
  }
}
