// @vitest-environment node
import { createDatabaseManager } from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ServiceOrderService,
  ServiceOrderError,
} from '../../server/service/order-service.js';
import type { ServiceLogger } from '../../server/service/logger.js';

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../database/main/migrations',
);

/**
 * The order lifecycle against a real database.
 *
 * The transition rules are conditional status updates inside transactions, so
 * they only mean anything next to a database: this applies the application's
 * own migrations to a throwaway SQLite file and drives the service through a
 * repeated acceptance, a full repair, a return and a close. It pins the two
 * properties the requirement names — a repeated request does not advance the
 * order a second time or duplicate the message, and a closed order is read
 * only — as well as the registration guards (device must belong to the
 * customer, a disabled device cannot start a repair).
 */
describe('service order lifecycle', () => {
  let manager: ReturnType<typeof createDatabaseManager>;
  let notifications: { send: ReturnType<typeof vi.fn> };
  let service: ServiceOrderService;
  const logger: ServiceLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };

  beforeAll(async () => {
    manager = createDatabaseManager({
      default: 'main',
      connections: { main: sqlite({ filename: ':memory:' }) },
    });
    const migrator = manager.createMigrator({
      directory: migrationsDirectory,
      packageName: '@nocobase/app-template-default',
    });
    await migrator.latest();
    notifications = { send: vi.fn(async () => ({ id: 'n1' })) };
    service = new ServiceOrderService(
      manager,
      notifications as never,
      undefined,
      logger,
    );
  });

  afterAll(async () => {
    await manager?.destroy();
  });

  async function seedOrderFixture(
    options: {
      deviceStatus?: string;
      deviceCustomerId?: number;
      status?: string;
      priority?: string;
      assigneeId?: string | null;
    } = {},
  ) {
    const query = manager.query();
    const now = new Date();
    const customerResult = await query
      .insertInto('customers')
      .values({ name: 'Acme', createdAt: now, updatedAt: now })
      .execute();
    const customerId = Number(customerResult.insertId);
    const deviceResult = await query
      .insertInto('devices')
      .values({
        deviceNo: `D-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Analyzer',
        customerId: options.deviceCustomerId ?? customerId,
        status: options.deviceStatus ?? 'enabled',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const deviceId = Number(deviceResult.insertId);
    const orderResult = await query
      .insertInto('serviceOrders')
      .values({
        orderNo: `SO-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Broken sensor',
        customerId,
        deviceId,
        status: options.status ?? 'pending_accept',
        priority: options.priority ?? 'normal',
        source: 'internal',
        confidential: false,
        assigneeId: options.assigneeId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return { customerId, deviceId, orderId: Number(orderResult.insertId) };
  }

  it('accepts once, then reports the current state instead of advancing again', async () => {
    const { orderId } = await seedOrderFixture({ assigneeId: 'engineer-1' });
    notifications.send.mockClear();

    const first = await service.accept(orderId, {
      userId: 'supervisor-1',
      role: 'supervisor',
    });
    expect(first.changed).toBe(true);
    expect(first.status).toBe('pending_process');

    const second = await service.accept(orderId, {
      userId: 'supervisor-1',
      role: 'supervisor',
    });
    expect(second.changed).toBe(false);
    expect(second.reason).toBe('ALREADY_ACCEPTED');

    const events = await manager
      .query()
      .selectFrom('serviceOrderEvents')
      .select(['action'])
      .where('orderId', '=', orderId)
      .execute();
    expect(events.filter((event) => event.action === 'accept')).toHaveLength(1);
    expect(notifications.send).toHaveBeenCalledTimes(1);

    const row = await manager
      .query()
      .selectFrom('serviceOrders')
      .select(['status', 'acceptanceNote', 'acceptedAt'])
      .where('id', '=', orderId)
      .executeTakeFirst();
    expect(row?.status).toBe('pending_process');
    expect(String(row?.acceptanceNote)).toContain('普通工单');
    expect(row?.acceptedAt).toBeTruthy();
  });

  it('applies the transition itself when the workflow run never advances the order', async () => {
    const { orderId } = await seedOrderFixture({ assigneeId: 'engineer-1' });
    const stalled = new ServiceOrderService(
      manager,
      notifications as never,
      {
        trigger: vi.fn(async () => ({ status: 'accepted', runId: 'run-1' })),
      } as never,
      logger,
    );

    const result = await stalled.accept(orderId, {
      userId: 'supervisor-1',
      role: 'supervisor',
    });
    expect(result).toMatchObject({
      status: 'pending_process',
      changed: true,
      reason: 'WORKFLOW_DID_NOT_RUN',
    });
    const row = await manager
      .query()
      .selectFrom('serviceOrders')
      .select('status')
      .where('id', '=', orderId)
      .executeTakeFirst();
    expect(row?.status).toBe('pending_process');
  });

  it('uses the urgent branch wording for an urgent order', async () => {
    const { orderId } = await seedOrderFixture({
      priority: 'urgent',
      assigneeId: 'engineer-2',
    });
    await service.accept(orderId, {
      userId: 'supervisor-1',
      role: 'supervisor',
    });
    const row = await manager
      .query()
      .selectFrom('serviceOrders')
      .select('acceptanceNote')
      .where('id', '=', orderId)
      .executeTakeFirst();
    expect(String(row?.acceptanceNote)).toContain('紧急工单');
  });

  it('drives processing, a return and a close, refusing to reopen a closed order', async () => {
    const { orderId } = await seedOrderFixture({ assigneeId: 'engineer-1' });
    await service.accept(orderId, {
      userId: 'supervisor-1',
      role: 'supervisor',
    });
    const actor = { userId: 'engineer-1', role: 'engineer' };

    await service.startProcessing(orderId, actor);
    await service.submitForConfirmation(orderId, actor, 'replaced the sensor');

    const returned = await service.returnToProcessing(
      orderId,
      {
        userId: 'supervisor-1',
        role: 'supervisor',
      },
      'please attach the report',
    );
    expect(returned.status).toBe('processing');

    let row = await manager
      .query()
      .selectFrom('serviceOrders')
      .select(['status', 'returnCount'])
      .where('id', '=', orderId)
      .executeTakeFirst();
    expect(row?.status).toBe('processing');
    expect(Number(row?.returnCount)).toBe(1);

    await service.submitForConfirmation(orderId, actor, 'report attached');
    const closed = await service.close(orderId, {
      userId: 'supervisor-1',
      role: 'supervisor',
    });
    expect(closed.status).toBe('closed');

    await expect(service.startProcessing(orderId, actor)).rejects.toThrow(
      ServiceOrderError,
    );
    row = await manager
      .query()
      .selectFrom('serviceOrders')
      .select('status')
      .where('id', '=', orderId)
      .executeTakeFirst();
    expect(row?.status).toBe('closed');
  });

  it('rejects a device that belongs to another customer and a disabled device', async () => {
    const { customerId } = await seedOrderFixture();
    const now = new Date();
    const otherCustomer = await manager
      .query()
      .insertInto('customers')
      .values({ name: 'Other', createdAt: now, updatedAt: now })
      .execute();
    const otherDevice = await manager
      .query()
      .insertInto('devices')
      .values({
        deviceNo: 'D-OTHER',
        name: 'Other device',
        customerId: Number(otherCustomer.insertId),
        status: 'enabled',
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await expect(
      service.createOrder(
        {
          title: 'Cross customer',
          customerId,
          deviceId: Number(otherDevice.insertId),
          priority: 'normal',
        },
        { userId: 'supervisor-1' },
      ),
    ).rejects.toMatchObject({ code: 'DEVICE_CUSTOMER_MISMATCH' });

    const disabled = await manager
      .query()
      .insertInto('devices')
      .values({
        deviceNo: 'D-DISABLED',
        name: 'Retired',
        customerId,
        status: 'disabled',
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await expect(
      service.createOrder(
        {
          title: 'Disabled device',
          customerId,
          deviceId: Number(disabled.insertId),
          priority: 'normal',
        },
        { userId: 'supervisor-1' },
      ),
    ).rejects.toMatchObject({ code: 'DEVICE_DISABLED' });
  });

  it('notifies every supervisor profile when an engineer submits for confirmation', async () => {
    const { orderId } = await seedOrderFixture({ assigneeId: 'engineer-1' });
    const now = new Date();
    await manager
      .query()
      .insertInto('engineerProfiles')
      .values([
        {
          username: 'sup-a',
          displayName: 'Supervisor A',
          appRole: 'supervisor',
          userId: 'supervisor-1',
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          username: 'sup-b',
          displayName: 'Supervisor B',
          appRole: 'supervisor',
          userId: 'supervisor-2',
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          username: 'eng-x',
          displayName: 'Engineer X',
          appRole: 'engineer',
          userId: 'engineer-1',
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    await service.accept(orderId, {
      userId: 'supervisor-1',
      role: 'supervisor',
    });
    notifications.send.mockClear();

    const actor = { userId: 'engineer-1', role: 'engineer' };
    await service.startProcessing(orderId, actor);
    await service.submitForConfirmation(orderId, actor, 'done');

    // Only the two supervisors are notified, not the engineer profile itself.
    expect(notifications.send).toHaveBeenCalledTimes(2);
    const recipients = notifications.send.mock.calls
      .map(
        (call) =>
          (call[0] as { messages: { inbox: { to: string } } }).messages.inbox
            .to,
      )
      .sort();
    expect(recipients).toEqual(['supervisor-1', 'supervisor-2']);
    expect(
      (
        notifications.send.mock.calls[0][0] as {
          messages: { inbox: Record<string, unknown> };
        }
      ).messages.inbox,
    ).toMatchObject({
      title: '工单已提交确认',
      target: { type: 'route' },
    });
  });

  it('returns the same order for a repeated external event', async () => {
    const { customerId, deviceId } = await seedOrderFixture();
    const first = await service.createOrder(
      {
        title: 'External report',
        customerId,
        deviceId,
        priority: 'normal',
        externalEventNo: 'EXT-1',
      },
      { userId: 'integration-1' },
    );
    const second = await service.createOrder(
      {
        title: 'External report again',
        customerId,
        deviceId,
        priority: 'normal',
        externalEventNo: 'EXT-1',
      },
      { userId: 'integration-1' },
    );
    expect(second.id).toBe(first.id);
    const rows = await manager
      .query()
      .selectFrom('serviceOrders')
      .select(['id'])
      .where('externalEventNo', '=', 'EXT-1')
      .execute();
    expect(rows).toHaveLength(1);
  });
});
