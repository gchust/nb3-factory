import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';

// Sends the acceptance notice to the work order's assignee through the durable
// in-app inbox. The idempotency key is derived from the work order and branch,
// so a repeated run does not create a second message.
export const run: WorkflowRunFunction = async (rawArgs, options) => {
  options.signal.throwIfAborted();
  const workOrderId = readString(rawArgs, 'workOrderId');
  const title = readString(rawArgs, 'title');
  const body = readString(rawArgs, 'body');
  const keySuffix = readString(rawArgs, 'keySuffix');
  const recipientId = readOptionalString(rawArgs, 'recipientId');
  if (!recipientId) {
    return { sent: false, reason: 'NO_RECIPIENT' };
  }
  if (!options.services.has(notificationServiceToken)) {
    return { sent: false, reason: 'NOTIFICATION_UNAVAILABLE' };
  }
  const notifications = options.services.resolve(notificationServiceToken);
  const result = await notifications.send({
    idempotencyKey: `work-order:${workOrderId}:accepted:${keySuffix}`,
    source: { type: 'workflow', referenceId: workOrderId },
    messages: {
      inbox: {
        to: recipientId,
        title,
        body,
        target: { type: 'route', path: `/work-orders/${workOrderId}` },
      },
    },
  });
  return {
    sent: true,
    notificationId: result.notificationId,
    status: result.status,
    deduplicated: result.deduplicated,
  };
};

function readString(rawArgs: unknown, key: string): string {
  const value = (rawArgs as Record<string, unknown> | null)?.[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Run argument "${key}" must be a non-empty string`);
  }
  return value;
}

function readOptionalString(rawArgs: unknown, key: string): string | null {
  const value = (rawArgs as Record<string, unknown> | null)?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
