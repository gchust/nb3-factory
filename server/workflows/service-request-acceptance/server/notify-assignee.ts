import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import {
  readRequestId,
  serviceRequestWorkflowStepsToken,
} from './contracts.ts';

/**
 * Ask the application to send one persistent in-app message to the request
 * assignee. The message text and the idempotency key live in the step service,
 * because this module is copied into an isolated Artifact store in production
 * and cannot import the notification package from there; see `./contracts.ts`.
 */
export const run: WorkflowRunFunction = async (
  rawArgs,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const requestId = readRequestId(rawArgs);
  const steps = options.services.resolve(serviceRequestWorkflowStepsToken);
  await steps.notifyAssignee({ requestId });
  options.logger.info('Service request assignee notified', { requestId });
  return null;
};
