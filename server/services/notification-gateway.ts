import type { NotificationService } from '@nocobase/app-plugin-notification/server';

import { ServiceError } from './errors.js';

// A narrow, typed seam over the Notification plugin's public service. Business services say what business event
// happened; this module owns the channel name, the idempotency key convention and the failure shape.
export interface InAppNotificationInput {
  /** Stable key: sending the same business event twice must not create a second message. */
  readonly idempotencyKey: string;
  readonly recipientId: string | null | undefined;
  readonly title: string;
  readonly body: string;
  /** Application-relative route the recipient should open, without the deployment base path. */
  readonly routePath?: string;
  readonly source?: { readonly type: string; readonly referenceId?: string };
}

export interface InAppNotificationResult {
  readonly sent: boolean;
  readonly notificationId: string | null;
  readonly status: string;
  readonly deduplicated: boolean;
  readonly reason?: string;
}

export interface NotificationGateway {
  sendInApp(input: InAppNotificationInput): Promise<InAppNotificationResult>;
}

/**
 * Resolves the plugin's service lazily: notification is registered by a plugin provider, and a business provider must
 * not assume its registration order. A missing channel or a missing recipient is reported as `sent: false` with a
 * reason instead of throwing, so the business transaction that triggered the message still commits.
 */
export function createNotificationGateway(
  resolve: () => NotificationService | undefined,
): NotificationGateway {
  return {
    async sendInApp(input): Promise<InAppNotificationResult> {
      const recipient = input.recipientId;
      if (!recipient) {
        return {
          sent: false,
          notificationId: null,
          status: 'skipped',
          deduplicated: false,
          reason: 'NO_RECIPIENT',
        };
      }
      const service = resolve();
      if (!service) {
        return {
          sent: false,
          notificationId: null,
          status: 'skipped',
          deduplicated: false,
          reason: 'NOTIFICATION_UNAVAILABLE',
        };
      }
      try {
        const result = await service.send({
          idempotencyKey: input.idempotencyKey,
          source: input.source,
          messages: {
            inbox: {
              to: recipient,
              title: input.title,
              body: input.body,
              target: input.routePath
                ? { type: 'route', path: input.routePath }
                : undefined,
            },
          },
        });
        return {
          sent: true,
          notificationId: result.notificationId,
          status: result.status,
          deduplicated: result.deduplicated,
        };
      } catch (error) {
        return {
          sent: false,
          notificationId: null,
          status: 'failed',
          deduplicated: false,
          reason:
            error instanceof Error ? error.message : 'NOTIFICATION_FAILED',
        };
      }
    },
  };
}

/** Raised only when a caller explicitly requires delivery to succeed. */
export function notificationUnavailable(): ServiceError {
  return new ServiceError(
    'NOTIFICATION_UNAVAILABLE',
    503,
    'The notification service is not available',
  );
}
