// @vitest-environment node
import type { DatabaseManager } from '@nocobase/db';
import { inAppNotificationStoreToken } from '@nocobase/app-plugin-notification-in-app/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import type { ServiceModuleConfig } from '../../server/config/service.js';
import { ServiceNotificationService } from '../../server/service/notifications.js';

/**
 * Honest delivery reporting.
 *
 * The inbox is always written. An external channel is only reported as sent
 * when the notification plugin actually accepted the message; a channel that
 * is declared but not registered, or absent entirely, is recorded as
 * `not_configured` with a reason instead of a fabricated success. The
 * notification service is a lazily created singleton, so resolving it must
 * create it rather than return `undefined` merely because nothing asked for it
 * yet.
 */

interface DeliveryRow {
  [key: string]: unknown;
  notificationKey: string;
  channel: string;
}

class FakeDb {
  readonly deliveries: DeliveryRow[] = [];
  private request = { key: '', channel: '' };

  query() {
    return this as unknown as ReturnType<DatabaseManager['query']>;
  }

  selectFrom() {
    return this;
  }

  select() {
    return this;
  }

  selectAll() {
    return this;
  }

  where(column: string, _operator: string, value: unknown) {
    if (column === 'notificationKey') this.request.key = String(value);
    if (column === 'channel') this.request.channel = String(value);
    return this;
  }

  insertInto() {
    return this;
  }

  values(row: DeliveryRow) {
    this.deliveries.push({ id: this.deliveries.length + 1, ...row });
    return this;
  }

  orderBy() {
    return this;
  }

  limit() {
    return this;
  }

  async execute(): Promise<DeliveryRow[]> {
    return this.deliveries;
  }

  async executeTakeFirst(): Promise<DeliveryRow | undefined> {
    return this.deliveries.find(
      (row) =>
        row.notificationKey === this.request.key &&
        row.channel === this.request.channel,
    );
  }
}

function config(externalChannels: readonly string[]): ServiceModuleConfig {
  return {
    inspection: {
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      overdueGraceHours: 0,
    },
    attachments: {
      disk: 'local',
      maxSizeMb: 10,
      allowedExtensions: ['pdf'],
    },
    notifications: { externalChannels },
    assistant: { enabled: true, maxResults: 5 },
  };
}

function build(input: {
  registeredChannels: readonly string[];
  withNotificationService: boolean;
}) {
  const db = new FakeDb();
  const container = new ServiceContainer();
  const inbox: string[] = [];
  container.instance(inAppNotificationStoreToken, {
    deliver: (message: { userId: string }) => {
      inbox.push(message.userId);
      return Promise.resolve({
        id: 'item-1',
        deliveryId: 'delivery-1',
        notificationId: 'notification-1',
        userId: message.userId,
        body: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
  } as never);
  const sent: unknown[] = [];
  if (input.withNotificationService) {
    container.instance(notificationServiceToken, {
      send: (message: unknown) => {
        sent.push(message);
        return Promise.resolve();
      },
    } as never);
  }
  const service = new ServiceNotificationService(
    db as unknown as DatabaseManager,
    container,
    config(['email']),
    input.registeredChannels,
  );
  return { service, inbox, sent, db };
}

const MESSAGE = {
  notificationKey: 'service-ticket:2:assign',
  title: 'Assigned',
  body: 'Ticket assigned to you.',
  ticketId: 2,
  recipient: { id: 'engineer-1', name: 'Engineer' },
  target: { type: 'route' as const, path: '/service/tickets/2' },
};

describe('service notification delivery', () => {
  it('sends through a configured channel and reports it as sent', async () => {
    const { service, inbox, sent } = build({
      registeredChannels: ['email'],
      withNotificationService: true,
    });
    const result = await service.notify(MESSAGE);
    expect(inbox).toEqual(['engineer-1']);
    expect(sent).toHaveLength(1);
    expect(result.inApp.delivered).toBe(true);
    expect(result.deliveries.map((row) => row.status)).toEqual([
      'sent',
      'sent',
    ]);
  });

  it('records not_configured when no external channel is configured', async () => {
    const { service, sent } = build({
      registeredChannels: [],
      withNotificationService: true,
    });
    const result = await service.notify(MESSAGE);
    expect(sent).toHaveLength(0);
    const external = result.deliveries.find(
      (row) => row.channel === 'external',
    );
    expect(external?.status).toBe('not_configured');
    expect(external?.lastError).toBe('EXTERNAL_CHANNEL_NOT_REGISTERED');
  });

  it('records not_configured when the notification service is absent', async () => {
    const { service } = build({
      registeredChannels: ['email'],
      withNotificationService: false,
    });
    const result = await service.notify(MESSAGE);
    const external = result.deliveries.find((row) => row.channel === 'email');
    expect(external?.status).toBe('not_configured');
    expect(external?.lastError).toBe('NOTIFICATION_SERVICE_UNAVAILABLE');
  });
});
