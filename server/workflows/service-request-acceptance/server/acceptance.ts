import { databaseManagerToken } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { i18nToken } from '@nocobase/app-server/i18n';
import { APP_NS } from '@nocobase/i18n/server';
import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';

/**
 * The business half of the acceptance workflow, kept beside the workflow package
 * so the run modules stay thin integration seams and the same functions can be
 * unit-tested without a running workflow engine.
 *
 * Every function is idempotent: a workflow retry or a re-run of the same
 * acceptance must not duplicate a state transition or a notification.
 */
export const SERVICE_REQUEST_COLLECTION = 'serviceRequests';

export type ServiceRequestResult = 'normal' | 'urgent';

export interface ServiceRequestRow {
  id: number;
  title: string;
  urgent: boolean;
  assigneeId: string | null;
  status: string;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

function serviceRequests(options: WorkflowRunOptions) {
  const database = options.services.resolve(databaseManagerToken);
  return database.repository<ServiceRequestRow>(SERVICE_REQUEST_COLLECTION);
}

/** Accepts the numeric request id that the run arguments and templates carry. */
export function readRequestId(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/u.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new Error('requestId must be a positive integer.');
}

/**
 * Moves a pending request to `processing` and reports the fields the
 * notification needs. A request already past `pending` is left untouched, so a
 * repeated run reports the same data without resetting progress.
 */
export async function registerAcceptance(
  options: WorkflowRunOptions,
  requestId: number,
): Promise<{ assigneeId: string | null; urgent: boolean; title: string }> {
  const repository = serviceRequests(options);
  const current = await repository.findOne({ filter: { id: requestId } });
  if (!current) {
    throw new Error(`Service request ${requestId} was not found.`);
  }
  if (current.status === 'pending') {
    await repository.updateOne({
      filter: { id: requestId },
      values: { status: 'processing', updatedAt: new Date().toISOString() },
    });
  }
  return {
    assigneeId: current.assigneeId,
    urgent: current.urgent,
    title: current.title,
  };
}

/** Records the normal or urgent acceptance result chosen by the request flag. */
export async function recordResult(
  options: WorkflowRunOptions,
  requestId: number,
  result: ServiceRequestResult,
): Promise<null> {
  const repository = serviceRequests(options);
  await repository.updateOne({
    filter: { id: requestId },
    values: {
      status: result === 'urgent' ? 'accepted_urgent' : 'accepted_normal',
      result,
      updatedAt: new Date().toISOString(),
    },
  });
  return null;
}

/**
 * Sends the assignee one persistent in-app message. The message uses the
 * triggering request's locale so outbound wording follows the person who
 * accepted the request; the target route is application-relative and the
 * runtime restores the deployment base path.
 */
export async function notifyAssignee(
  options: WorkflowRunOptions,
  input: {
    requestId: number;
    locale: string;
    assigneeId: string | null;
    urgent: boolean;
    title: string;
  },
): Promise<null> {
  if (!input.assigneeId) {
    options.logger.warn('Accepted service request has no assignee to notify', {
      requestId: input.requestId,
    });
    return null;
  }
  const notification = options.services.resolve(notificationServiceToken);
  const i18n = options.services.resolve(i18nToken);
  const locale = i18n.resolveLocale(input.locale);
  await i18n.ensureLocaleLoaded(locale);
  const t = i18n.getFixedT(APP_NS, locale);
  const title = t('serviceRequest.notification.title');
  const body = input.urgent
    ? t('serviceRequest.notification.bodyUrgent', { title: input.title })
    : t('serviceRequest.notification.bodyNormal', { title: input.title });
  await notification.send({
    idempotencyKey: `service-request-accepted:${input.requestId}`,
    source: { type: 'service-request', referenceId: String(input.requestId) },
    messages: {
      inbox: {
        to: input.assigneeId,
        title,
        body,
        target: { type: 'route', path: `/service-requests/${input.requestId}` },
      },
    },
  });
  return null;
}
