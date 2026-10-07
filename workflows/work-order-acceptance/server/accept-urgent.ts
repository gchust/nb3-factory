import { randomUUID } from 'node:crypto';

import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { WorkflowRunOptions, WorkflowRunServices } from '@nocobase/app-plugin-workflow';
import {
  notificationServiceToken,
  type NotificationService,
} from '@nocobase/app-plugin-notification/server';

import { pickAssignee, readOrder, type WorkOrderRow } from './order.js';

interface Input {
  readonly workOrderId: string;
  readonly orderNo: string;
  readonly priority: 'urgent' | 'normal';
}

interface UrgentResult {
  readonly branch: 'urgent';
  readonly accepted: boolean;
  readonly alreadyAccepted: boolean;
  readonly status: string;
  readonly assigneeId: string | null;
}

async function notify(
  services: WorkflowRunServices,
  order: WorkOrderRow,
  assigneeId: string,
): Promise<void> {
  if (!services.has(notificationServiceToken)) return;
  const notification = services.resolve<NotificationService>(notificationServiceToken);
  const recipients = [assigneeId, order.createdById].filter(
    (id): id is string => Boolean(id),
  );
  const unique = Array.from(new Set(recipients));
  if (!unique.length) return;
  await notification.send({
    idempotencyKey: `service.workOrder:${order.id}:accept`,
    source: { type: 'workOrder', referenceId: order.id },
    messages: {
      inbox: {
        to: unique as [string, ...string[]],
        title: `Urgent work order accepted: ${order.orderNo}`,
        body: `${order.title} was automatically accepted and assigned.`,
        target: { type: 'route', path: `/workOrders/${order.id}` },
      },
    },
  });
}

/**
 * The urgent branch: assign the order to the least-loaded available engineer
 * and move it from 待受理 to 待处理 in one transaction.
 *
 * A second acceptance (the supervisor accepted it first, or the trigger was
 * retried) is not an error: the run reports `alreadyAccepted`, so the branch a
 * run explains still matches the order's real state. A group with no available
 * engineer throws, which records a failed node run and leaves the order in
 * 待受理 for a supervisor to accept by hand.
 */
export async function run(
  { input }: { readonly input: Input },
  { services }: WorkflowRunOptions,
): Promise<UrgentResult> {
  const database = services.resolve<DatabaseManager>(databaseManagerToken);
  const order = await readOrder(database, input.workOrderId);
  if (!order) {
    throw new Error(`Work order ${input.workOrderId} was not found`);
  }
  if (order.status !== 'pending_acceptance') {
    return {
      branch: 'urgent',
      accepted: order.status !== 'pending_acceptance',
      alreadyAccepted: true,
      status: order.status,
      assigneeId: order.assigneeId ?? null,
    };
  }
  const assigneeId = await pickAssignee(database, order.groupId ?? null);
  if (!assigneeId) {
    throw new Error(
      'AUTO_ACCEPT_NO_ASSIGNEE: no active engineer is available for automatic acceptance',
    );
  }
  const now = new Date().toISOString();
  await database.transaction(async (connection) => {
    await connection.repository('workOrders').updateOne({
      filter: { id: order.id },
      values: {
        status: 'pending_processing',
        assigneeId,
        acceptedAt: now,
        updatedAt: now,
      },
    });
    await connection.repository('workOrderExecutions').createOne({
      values: {
        id: `exec-workflow-${randomUUID()}`,
        workOrderId: order.id,
        action: 'accept',
        fromStatus: 'pending_acceptance',
        toStatus: 'pending_processing',
        operatorId: null,
        idempotencyKey: null,
        result: 'succeeded',
        detail: 'workflow',
        attempt: 1,
        createdAt: now,
      },
    });
  });
  await notify(services, order, assigneeId);
  return {
    branch: 'urgent',
    accepted: true,
    alreadyAccepted: false,
    status: 'pending_processing',
    assigneeId,
  };
}
