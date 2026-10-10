import {
  authorizeCompositeAction,
  scopedRepository,
  type RequestServiceContext,
} from './context.js';
import { notFound } from './errors.js';
import { insertOrder } from './orders.js';
import type {
  DeviceRow,
  ServiceOrderLogRow,
  ServiceOrderRow,
} from './types.js';

export interface DeviceEventInput {
  readonly externalEventId: string;
  readonly deviceCode: string;
  readonly title: string;
  readonly description?: string | null;
  readonly priority?: string;
  readonly occurredAt?: string | null;
  readonly dueAt?: string | null;
}

export interface DeviceEventResult {
  readonly order: ServiceOrderRow;
  readonly created: boolean;
  readonly externalEventId: string;
}

/**
 * Accepts an event from the device platform and turns it into a service order.
 *
 * The platform may retry a delivery, so the event id is the idempotency key in
 * two places: the order carries it in `externalEventId` under a unique index,
 * and the audit log records `platform-event:<id>` so a repeated request is
 * answered with the order the first one created instead of a second order.
 */
export async function submitDeviceEvent(
  context: RequestServiceContext,
  input: DeviceEventInput,
): Promise<DeviceEventResult> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.integration',
    ['submit'],
  );
  const devices = scopedRepository<DeviceRow>(
    context.database,
    'devices',
    policies,
  );
  const logs =
    context.database.repository<ServiceOrderLogRow>('service_order_logs');

  const eventKey = `platform-event:${input.externalEventId}`;
  const seen = await logs.findOne({ filter: { idempotencyKey: eventKey } });
  if (seen) {
    const orders = scopedRepository<ServiceOrderRow>(
      context.database,
      'service_orders',
      policies,
    );
    const order = await orders.findOne({ filter: { id: seen.orderId } });
    if (order) {
      return { order, created: false, externalEventId: input.externalEventId };
    }
  }

  const device = await devices.findOne({ filter: { code: input.deviceCode } });
  if (!device) {
    throw notFound(
      'DEVICE_NOT_FOUND',
      `No device is registered with code ${input.deviceCode}.`,
    );
  }

  const inserted = await insertOrder(context, policies, {
    title: input.title,
    deviceId: device.id,
    customerId: device.customerId,
    description: input.description ?? null,
    priority: input.priority ?? 'high',
    dueAt: input.dueAt ?? null,
    assigneeId: device.engineerId ?? null,
    groupId: device.groupId ?? null,
    source: 'platform',
    externalEventId: input.externalEventId,
  });

  if (inserted.created) {
    const now = new Date().toISOString();
    await logs.createOne({
      values: {
        orderId: inserted.order.id,
        action: 'platform_event',
        status: inserted.order.status,
        message: `Platform event ${input.externalEventId} received`,
        detail: {
          externalEventId: input.externalEventId,
          deviceCode: input.deviceCode,
          occurredAt: input.occurredAt ?? null,
        },
        actorId: context.actorId,
        idempotencyKey: eventKey,
        startedAt: now,
        finishedAt: now,
        createdAt: now,
      } as never,
    });
  }

  return {
    order: inserted.order,
    created: inserted.created,
    externalEventId: input.externalEventId,
  };
}

/** Reads back the order a previously delivered platform event produced. */
export async function findDeviceEvent(
  context: RequestServiceContext,
  externalEventId: string,
): Promise<{ order: ServiceOrderRow; externalEventId: string }> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.integration',
    ['submit'],
  );
  const orders = scopedRepository<ServiceOrderRow>(
    context.database,
    'service_orders',
    policies,
  );
  const order = await orders.findOne({ filter: { externalEventId } });
  if (!order) {
    throw notFound(
      'EVENT_NOT_FOUND',
      `No order was created for platform event ${externalEventId}.`,
    );
  }
  return { order, externalEventId };
}
