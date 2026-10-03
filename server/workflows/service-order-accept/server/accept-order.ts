import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { databaseManagerToken } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';

interface AcceptArgs {
  orderId?: unknown;
  operatorId?: unknown;
  note?: unknown;
}

interface OrderRow {
  id: number | string;
  status: string;
  assigneeId: number | string | null;
}

/**
 * Applies one intake acceptance to a service order. The urgency branch passes
 * the matching `note`, so the acceptance text differs per branch while the
 * logic stays in one idempotent place.
 *
 * Idempotency is enforced three times: the state update is conditional on the
 * current status, the execution record carries a unique idempotency key, and
 * the notification has its own idempotency key. A retried workflow run neither
 * advances the order twice nor sends the same business message again.
 */
export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const args = rawArgs as AcceptArgs;
  const orderId = Number(args.orderId);
  const operatorId = typeof args.operatorId === 'string' ? args.operatorId : '';
  const note =
    typeof args.note === 'string' && args.note.trim()
      ? args.note
      : '普通工单：按标准流程安排常规处理。';
  if (!Number.isFinite(orderId) || operatorId.length === 0) {
    throw new Error('orderId and operatorId are required.');
  }

  const database = options.services.resolve(databaseManagerToken);
  const now = new Date();
  const eventKey = `service-order-accept:${orderId}`;

  const outcome = await database.transaction(async (connection) => {
    const order = (await connection.query
      .selectFrom('serviceOrders')
      .select(['id', 'status', 'assigneeId'])
      .where('id', '=', orderId)
      .executeTakeFirst()) as unknown as OrderRow | undefined;
    if (!order) {
      throw new Error(`Service order ${orderId} was not found.`);
    }
    if (order.status !== 'pending_accept') {
      return {
        accepted: false,
        status: order.status,
        assigneeId: order.assigneeId,
      };
    }

    const existingEvent = await connection.query
      .selectFrom('serviceOrderEvents')
      .select('id')
      .where('idempotencyKey', '=', eventKey)
      .executeTakeFirst();
    if (existingEvent) {
      return {
        accepted: false,
        status: order.status,
        assigneeId: order.assigneeId,
      };
    }

    await connection.query
      .updateTable('serviceOrders')
      .set({
        status: 'pending_process',
        acceptanceNote: note,
        acceptedAt: now,
        updatedAt: now,
      })
      .where('id', '=', orderId)
      .where('status', '=', 'pending_accept')
      .execute();

    await connection.query
      .insertInto('serviceOrderEvents')
      .values({
        orderId,
        action: 'accept',
        fromStatus: 'pending_accept',
        toStatus: 'pending_process',
        operatorId,
        operatorRole: 'supervisor',
        comment: note,
        idempotencyKey: eventKey,
        createdAt: now,
      })
      .execute();

    return {
      accepted: true,
      status: 'pending_process',
      assigneeId: order.assigneeId,
    };
  });

  if (outcome.accepted && outcome.assigneeId != null) {
    const notifications = options.services.resolve(notificationServiceToken);
    await notifications.send({
      idempotencyKey: `service-order-accepted:${orderId}`,
      source: { type: 'service-order', referenceId: String(orderId) },
      messages: {
        inbox: {
          to: String(outcome.assigneeId),
          title: '新的服务工单待处理',
          body: `工单 #${orderId} 已受理：${note}`,
          target: { type: 'route', path: `/service/orders/${orderId}` },
        },
      },
    });
  }

  options.logger.info('Service order acceptance applied', {
    orderId,
    accepted: outcome.accepted,
    status: outcome.status,
  });
  return { accepted: outcome.accepted, status: outcome.status };
};
