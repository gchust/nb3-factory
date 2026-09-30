import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import type { Logger } from '@nocobase/logging';
import type { ServiceResolver } from '@nocobase/service-provider';

/**
 * Thin wrapper over the notification plugin's public service. A notification is
 * a side effect of a business operation: it must never turn a successful
 * transition into a failed request, so delivery problems are logged and
 * reported to the caller instead of thrown.
 */

export interface InAppTarget {
  type: 'route' | 'url';
  path?: string;
  url?: string;
}

export interface InAppNotice {
  /** Application user id, or several ids to deliver one message each. */
  to: string | readonly string[];
  title: string;
  body: string;
  target?: InAppTarget;
}

export interface NoticeResult {
  delivered: boolean;
  error?: string;
}

export class ServiceNotifier {
  public constructor(
    private readonly resolver: ServiceResolver,
    private readonly logger: Logger,
  ) {}

  public available(): boolean {
    return this.resolver.has(notificationServiceToken);
  }

  public async notify(
    idempotencyKey: string,
    sourceType: string,
    referenceId: string,
    notice: InAppNotice,
  ): Promise<NoticeResult> {
    if (!this.available()) {
      return { delivered: false, error: 'notification service unavailable' };
    }
    try {
      const service = this.resolver.resolve<NotificationService>(
        notificationServiceToken,
      );
      await service.send({
        idempotencyKey,
        source: { type: sourceType, referenceId },
        messages: {
          inbox: {
            to: notice.to,
            title: notice.title,
            body: notice.body,
            ...(notice.target ? { target: notice.target } : {}),
          },
        },
      });
      return { delivered: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        { err: error, idempotencyKey },
        'service notification delivery failed',
      );
      return { delivered: false, error: message };
    }
  }
}
