import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';

interface NotifyResponsibleArgs {
  workOrderId?: unknown;
  accepted?: unknown;
  escalated?: unknown;
  alreadyProcessed?: unknown;
  assigneeId?: unknown;
  supervisorId?: unknown;
  code?: unknown;
  title?: unknown;
  locale?: unknown;
}

function optionalId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Send one durable in-app message about the acceptance outcome.
 *
 * An escalated order that still waits for the supervisor goes to the supervisor; an accepted order goes to the
 * engineer who owns it. The message idempotency key is stable per work order and outcome, so a retried run
 * cannot duplicate the same business message.
 */
export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const args = rawArgs as NotifyResponsibleArgs;
  const workOrderId = Number(args.workOrderId);
  if (!Number.isInteger(workOrderId) || workOrderId <= 0) {
    throw new Error('workOrderId must be a positive integer.');
  }
  if (args.alreadyProcessed === true) {
    return { notified: false };
  }

  const accepted = args.accepted === true;
  const escalated = args.escalated === true;
  const assigneeId = optionalId(args.assigneeId);
  const supervisorId = optionalId(args.supervisorId);
  const to = escalated && !accepted ? (supervisorId ?? assigneeId) : assigneeId;
  if (!to) {
    return { notified: false };
  }
  if (!options.services.has(notificationServiceToken)) {
    options.logger.warn(
      'Notification service is not available; message skipped',
      {
        workOrderId,
      },
    );
    return { notified: false };
  }

  const code =
    typeof args.code === 'string' && args.code
      ? args.code
      : String(workOrderId);
  const title = typeof args.title === 'string' ? args.title : '';
  const stall = escalated && !accepted;
  const label = stall ? 'escalated' : 'accepted';
  const chinese =
    typeof args.locale === 'string' &&
    args.locale.toLowerCase().startsWith('zh');
  const headline = chinese
    ? stall
      ? '紧急工单待受理'
      : escalated
        ? '紧急工单已受理'
        : '新工单已派发给您'
    : stall
      ? 'Urgent work order awaiting acceptance'
      : escalated
        ? 'Urgent work order accepted'
        : 'A new work order was assigned to you';
  const body = chinese
    ? stall
      ? `工单 ${code}「${title}」已升级，请尽快安排受理。`
      : `工单 ${code}「${title}」已受理并派发，请及时处理。`
    : stall
      ? `Work order ${code} "${title}" was escalated; please arrange acceptance soon.`
      : `Work order ${code} "${title}" was accepted and dispatched; please handle it promptly.`;

  try {
    await options.services.resolve(notificationServiceToken).send({
      idempotencyKey: `service-work-order:${workOrderId}:acceptance:${label}`,
      source: {
        type: 'service-work-order',
        referenceId: String(workOrderId),
      },
      messages: {
        inbox: {
          to,
          title: headline,
          body,
          target: {
            type: 'route',
            path: `/service/work-orders/${workOrderId}`,
          },
        },
      },
    });
  } catch (error) {
    options.logger.warn('Could not deliver the acceptance notification', {
      workOrderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { notified: false };
  }
  return { notified: true };
};
