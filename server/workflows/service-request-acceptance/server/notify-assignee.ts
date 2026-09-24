import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { databaseManagerToken } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';

interface ServiceRequestRow {
  id: number | string;
  reference: string;
  title: string;
  urgent: boolean;
  assigneeId: string;
  status: string;
  result?: string | null;
}

function readRequestId(args: Record<string, unknown>): string {
  const value = args.requestId;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('requestId is required.');
  }
  return value.trim();
}

function idFilter(requestId: string): { id: number | string } {
  return /^\d+$/.test(requestId)
    ? { id: Number(requestId) }
    : { id: requestId };
}

/**
 * Send the single persistent in-app message that tells the assignee their
 * request was accepted.
 *
 * The request is re-read here rather than taken from an earlier node: a
 * branch-hidden node's result is not visible to a shared successor, so the
 * committed row is the source of truth for both the urgency route and the
 * result. The stable idempotency key means a retried run resumes the same
 * notification instead of sending a second one.
 */
const run: WorkflowRunFunction = async (
  rawArgs,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const requestId = readRequestId(rawArgs as Record<string, unknown>);
  const database = options.services.resolve(databaseManagerToken);
  const notification = options.services.resolve(notificationServiceToken);

  const request = await database
    .repository<ServiceRequestRow>('serviceRequests')
    .findOne({ filter: idFilter(requestId) });
  if (!request) {
    throw new Error(`Service request "${requestId}" was not found.`);
  }

  const urgent = Boolean(request.urgent);
  const urgentLabel = urgent ? '是 / Yes' : '否 / No';
  const resultLabel =
    request.result === 'urgent' ? '紧急 / Urgent' : '普通 / Normal';

  const sent = await notification.send({
    idempotencyKey: `service-request-accepted:${requestId}`,
    source: { type: 'service-request', referenceId: requestId },
    messages: {
      inbox: {
        to: String(request.assigneeId),
        title: `受理通知 / Acceptance notice: ${request.reference}`,
        body: [
          '您好，您的服务请求已被受理。',
          'Your service request has been accepted.',
          '',
          `标题 / Title: ${request.title}`,
          `编号 / Reference: ${request.reference}`,
          `紧急 / Urgent: ${urgentLabel}`,
          `结果 / Result: ${resultLabel}`,
        ].join('\n'),
        target: { type: 'route', path: `/service-requests/${request.id}` },
      },
    },
  });

  return {
    notificationId: sent.notificationId,
    deduplicated: sent.deduplicated,
  };
};

export { run };
