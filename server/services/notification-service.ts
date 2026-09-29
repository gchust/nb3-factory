import type { NotificationService } from '@nocobase/app-plugin-notification/server';

export interface InAppMessageInput {
  readonly userId: string;
  readonly title: string;
  readonly body: string;
  /** Application-internal route the inbox entry links to. */
  readonly path?: string;
  readonly idempotencyKey: string;
  readonly sourceType: string;
  readonly referenceId?: string;
}

export interface InAppMessageResult {
  readonly delivered: boolean;
  readonly notificationId?: string;
  readonly deduplicated?: boolean;
  readonly error?: string;
}

/** Late-bound access to the notification plugin's service. */
export type NotificationServiceResolver = () => NotificationService | undefined;

/**
 * Thin, failure-tolerant wrapper over the notification plugin.
 *
 * A notification that cannot be delivered must never fail the business action
 * that triggered it, so the wrapper reports the outcome instead of throwing;
 * callers decide whether to surface it.
 *
 * The plugin's service is resolved lazily: all providers register their
 * bindings before any `boot()`, so a reference captured during registration
 * would be `undefined`. Resolving at send time also means the in-app channel
 * the provider registers during its own boot is present.
 */
export class ServiceNotificationService {
  private readonly resolveNotifications: NotificationServiceResolver;

  constructor(source?: NotificationService | NotificationServiceResolver) {
    if (typeof source === 'function') {
      this.resolveNotifications = source;
    } else {
      this.resolveNotifications = () => source;
    }
  }

  get enabled(): boolean {
    return Boolean(this.resolveNotifications());
  }

  async sendInApp(input: InAppMessageInput): Promise<InAppMessageResult> {
    const notifications = this.resolveNotifications();
    if (!notifications) {
      return { delivered: false, error: 'NOTIFICATION_SERVICE_UNAVAILABLE' };
    }
    try {
      const result = await notifications.send({
        idempotencyKey: input.idempotencyKey,
        source: { type: input.sourceType, referenceId: input.referenceId },
        messages: {
          inApp: {
            to: input.userId,
            title: input.title,
            body: input.body,
            target: input.path
              ? { type: 'route', path: input.path }
              : undefined,
          },
        },
      });
      return {
        delivered: true,
        notificationId: result.notificationId,
        deduplicated: result.deduplicated,
      };
    } catch (error) {
      return {
        delivered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async status(idempotencyKey: string): Promise<unknown> {
    const notifications = this.resolveNotifications();
    if (!notifications) {
      return undefined;
    }
    return notifications.getByIdempotencyKey(idempotencyKey);
  }
}
