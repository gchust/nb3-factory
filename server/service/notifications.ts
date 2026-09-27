import { inAppNotificationStoreToken } from '@nocobase/app-plugin-notification-in-app/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceResolver,
} from '@nocobase/service-provider';
import type { ServiceModuleConfig } from '../config/service.js';
import { ServiceError } from './access.js';

/**
 * Durable in-app delivery plus an optional external channel.
 *
 * The in-app inbox is always authoritative and always available: it is the
 * store the notification plugin keeps in the application database. External
 * channels are opt-in through `service.notifications.externalChannels`; when
 * nothing is configured the delivery row is written as `not_configured` rather
 * than being reported as sent.
 */

export const serviceNotificationToken =
  createServiceToken<ServiceNotificationService>('service.notifications');

export interface ServiceNotificationRecipient {
  readonly id: string;
  readonly name?: string | null;
}

export interface ServiceNotificationInput {
  /** Stable key; a repeated delivery is a no-op, not a second message. */
  readonly notificationKey: string;
  readonly title: string;
  readonly body: string;
  readonly ticketId?: number | null;
  readonly recipient: ServiceNotificationRecipient;
  readonly target?:
    { type: 'route'; path: string } | { type: 'url'; url: string };
}

export interface ServiceDeliveryStatus {
  readonly configured: boolean;
  readonly channels: readonly string[];
  readonly reason?: string;
}

export interface ServiceDeliveryRow {
  readonly id: number | string;
  readonly notificationKey: string;
  readonly channel: string;
  readonly status: string;
  readonly attempts: number;
  readonly recipientId: string | null;
  readonly recipientName: string | null;
  readonly title: string;
  readonly body: string;
  readonly ticketId: number | null;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class ServiceNotificationService {
  private readonly config: ServiceModuleConfig;
  /** Channel names the notification plugin has configured, from app config. */
  private readonly registered: ReadonlySet<string>;

  constructor(
    private readonly database: DatabaseManager,
    private readonly container: ServiceResolver,
    config: ServiceModuleConfig,
    registeredChannels: readonly string[],
  ) {
    this.config = config;
    this.registered = new Set(registeredChannels);
  }

  /** The channels this application is actually able to deliver through. */
  status(): {
    inApp: { available: true };
    external: ServiceDeliveryStatus;
  } {
    const channels = this.configuredChannels();
    return {
      inApp: { available: true },
      external:
        channels.length > 0
          ? { configured: true, channels }
          : {
              configured: false,
              channels: [],
              reason: 'NO_EXTERNAL_CHANNEL_CONFIGURED',
            },
    };
  }

  /**
   * Delivers one notification to the inbox and, when configured, to each
   * external channel. Returns what actually happened, never a claim of
   * delivery that did not occur.
   */
  async notify(input: ServiceNotificationInput): Promise<{
    inApp: { delivered: boolean; itemId?: string };
    deliveries: readonly ServiceDeliveryRow[];
  }> {
    const now = new Date().toISOString();
    const deliveries: ServiceDeliveryRow[] = [];

    const store = this.container.resolve(inAppNotificationStoreToken);
    let inboxDelivered = false;
    let inboxItemId: string | undefined;
    if (!(await this.deliveryExists(input.notificationKey, 'inbox'))) {
      const item = await store.deliver({
        deliveryId: `${input.notificationKey}:inbox`,
        notificationId: input.notificationKey,
        userId: input.recipient.id,
        message: {
          to: input.recipient.id,
          title: input.title,
          body: input.body,
          target: input.target,
        },
        createdAt: now,
      });
      inboxItemId = item.id;
      inboxDelivered = true;
      deliveries.push(
        await this.insertDelivery(input, 'inbox', 'sent', undefined, now),
      );
    } else {
      deliveries.push(await this.readDelivery(input.notificationKey, 'inbox'));
    }

    const channels = this.configuredChannels();
    if (channels.length === 0) {
      deliveries.push(
        await this.insertDelivery(
          input,
          'external',
          'not_configured',
          this.config.notifications.externalChannels.length > 0
            ? 'EXTERNAL_CHANNEL_NOT_REGISTERED'
            : 'NO_EXTERNAL_CHANNEL_CONFIGURED',
          now,
        ),
      );
      return {
        inApp: { delivered: inboxDelivered, itemId: inboxItemId },
        deliveries,
      };
    }

    for (const channel of channels) {
      deliveries.push(await this.sendExternal(input, channel, now));
    }
    return {
      inApp: { delivered: inboxDelivered, itemId: inboxItemId },
      deliveries,
    };
  }

  /** Delivery records for the supervisor view. */
  async listDeliveries(input: {
    readonly ticketId?: number | null;
    readonly limit?: number;
  }): Promise<ServiceDeliveryRow[]> {
    let query = this.database
      .query()
      .selectFrom('service_notification_deliveries')
      .selectAll()
      .orderBy('id', 'desc')
      .limit(Math.min(Math.max(input.limit ?? 50, 1), 200));
    if (input.ticketId !== undefined && input.ticketId !== null) {
      query = query.where('ticketId', '=', input.ticketId);
    }
    const rows = await query.execute<Record<string, unknown>>();
    return rows.map((row) => normalizeDelivery(row));
  }

  /** Re-attempts a delivery that failed. `not_configured` cannot be retried. */
  async retry(deliveryId: number): Promise<ServiceDeliveryRow> {
    const row = await this.database
      .query()
      .selectFrom('service_notification_deliveries')
      .selectAll()
      .where('id', '=', deliveryId)
      .executeTakeFirst<Record<string, unknown>>();
    if (!row) {
      throw new ServiceError(
        404,
        'DELIVERY_NOT_FOUND',
        'Delivery record not found.',
      );
    }
    const delivery = normalizeDelivery(row);
    if (delivery.channel === 'inbox') {
      throw new ServiceError(
        409,
        'DELIVERY_NOT_RETRYABLE',
        'In-app deliveries are committed with the message and cannot be retried.',
      );
    }
    const channels = this.configuredChannels();
    if (!channels.includes(delivery.channel)) {
      throw new ServiceError(
        409,
        'CHANNEL_NOT_CONFIGURED',
        'The external channel for this delivery is not configured.',
      );
    }

    const now = new Date().toISOString();
    const result = await this.deliverExternal(
      {
        notificationKey: delivery.notificationKey,
        title: delivery.title,
        body: delivery.body,
        ticketId: delivery.ticketId,
        recipient: {
          id: delivery.recipientId ?? '',
          name: delivery.recipientName,
        },
      },
      delivery.channel,
    );
    const attempts = delivery.attempts + 1;
    await this.database
      .query()
      .updateTable('service_notification_deliveries')
      .set({
        status: result.status,
        attempts,
        lastError: result.error ?? null,
        updatedAt: now,
      })
      .where('id', '=', deliveryId)
      .execute();
    return {
      ...delivery,
      status: result.status,
      attempts,
      lastError: result.error ?? null,
      updatedAt: now,
    };
  }

  /** The caller's durable inbox page. */
  async inbox(
    userId: string,
    options: {
      readonly unreadOnly?: boolean;
      readonly limit?: number;
      readonly before?: { readonly createdAt: string; readonly id: string };
    } = {},
  ): Promise<readonly Record<string, unknown>[]> {
    const store = this.container.resolve(inAppNotificationStoreToken);
    const items = await store.list({
      userId,
      unreadOnly: options.unreadOnly,
      limit: options.limit,
      before: options.before,
    });
    return items.map((item) => ({ ...item }));
  }

  async unreadCount(userId: string): Promise<number> {
    const store = this.container.resolve(inAppNotificationStoreToken);
    return store.countUnread(userId);
  }

  async updateInbox(
    userId: string,
    id: string,
    action: 'read' | 'unread' | 'delete',
  ): Promise<Record<string, unknown> | undefined> {
    const store = this.container.resolve(inAppNotificationStoreToken);
    const item = await store.update({ id, userId, action });
    return item ? { ...item } : undefined;
  }

  async markAllRead(userId: string): Promise<number> {
    const store = this.container.resolve(inAppNotificationStoreToken);
    return store.markAllRead(userId);
  }

  private configuredChannels(): string[] {
    const declared = new Set(this.config.notifications.externalChannels);
    if (declared.size === 0) return [];
    return [...declared].filter((channel) => this.registered.has(channel));
  }

  private async sendExternal(
    input: ServiceNotificationInput,
    channel: string,
    now: string,
  ): Promise<ServiceDeliveryRow> {
    if (await this.deliveryExists(input.notificationKey, channel)) {
      return this.readDelivery(input.notificationKey, channel);
    }
    const result = await this.deliverExternal(input, channel);
    return this.insertDelivery(
      input,
      channel,
      result.status,
      result.error,
      now,
    );
  }

  private async deliverExternal(
    input: ServiceNotificationInput,
    channel: string,
  ): Promise<{ status: string; error?: string }> {
    if (!this.container.has(notificationServiceToken)) {
      return {
        status: 'not_configured',
        error: 'NOTIFICATION_SERVICE_UNAVAILABLE',
      };
    }
    const service = this.container.resolve(notificationServiceToken);
    try {
      await service.send({
        idempotencyKey: `${input.notificationKey}:${channel}`,
        source: {
          type: 'service-ticket',
          referenceId: String(input.ticketId ?? ''),
        },
        messages: {
          [channel]: {
            recipient: { userId: input.recipient.id, to: input.recipient.id },
            message: {
              title: input.title,
              body: input.body,
              target: input.target,
            },
          },
        },
      });
      return { status: 'sent' };
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async deliveryExists(
    notificationKey: string,
    channel: string,
  ): Promise<boolean> {
    const row = await this.database
      .query()
      .selectFrom('service_notification_deliveries')
      .select(['id'])
      .where('notificationKey', '=', notificationKey)
      .where('channel', '=', channel)
      .executeTakeFirst();
    return row !== undefined;
  }

  private async readDelivery(
    notificationKey: string,
    channel: string,
  ): Promise<ServiceDeliveryRow> {
    const row = await this.database
      .query()
      .selectFrom('service_notification_deliveries')
      .selectAll()
      .where('notificationKey', '=', notificationKey)
      .where('channel', '=', channel)
      .executeTakeFirst<Record<string, unknown>>();
    return normalizeDelivery(row ?? {});
  }

  private async insertDelivery(
    input: ServiceNotificationInput,
    channel: string,
    status: string,
    lastError: string | undefined,
    now: string,
  ): Promise<ServiceDeliveryRow> {
    await this.database
      .query()
      .insertInto('service_notification_deliveries')
      .values({
        notificationKey: input.notificationKey,
        channel,
        status,
        attempts: status === 'sent' ? 1 : 0,
        recipientId: input.recipient.id,
        recipientName: input.recipient.name ?? null,
        title: input.title,
        body: input.body,
        ticketId: input.ticketId ?? null,
        lastError: lastError ?? null,
        nextRetryAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.readDelivery(input.notificationKey, channel);
  }
}

function normalizeDelivery(row: Record<string, unknown>): ServiceDeliveryRow {
  return {
    id: (row.id as number | string) ?? 0,
    notificationKey: (row.notificationKey as string) ?? '',
    channel: (row.channel as string) ?? 'inbox',
    status: (row.status as string) ?? 'unknown',
    attempts: Number(row.attempts ?? 0),
    recipientId: (row.recipientId as string | null) ?? null,
    recipientName: (row.recipientName as string | null) ?? null,
    title: (row.title as string) ?? '',
    body: (row.body as string) ?? '',
    ticketId:
      row.ticketId === null || row.ticketId === undefined
        ? null
        : Number(row.ticketId),
    lastError: (row.lastError as string | null) ?? null,
    createdAt: (row.createdAt as string) ?? '',
    updatedAt: (row.updatedAt as string) ?? '',
  };
}

export function createServiceNotificationService(
  container: ServiceResolver,
  config: ServiceModuleConfig,
  registeredChannels: readonly string[],
): ServiceNotificationService {
  return new ServiceNotificationService(
    container.resolve(databaseManagerToken),
    container,
    config,
    registeredChannels,
  );
}
