import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import {
  readRequestId,
  serviceRequestWorkflowStepsToken,
} from './contracts.ts';

/**
 * Mark the request accepted and return the values the later nodes consume.
 *
 * This module only validates the trigger and delegates. It must not import an
 * application package: production copies it into an isolated Artifact store
 * whose location is not guaranteed to be inside the application's
 * `node_modules`, so the step service is reached through a token instead (see
 * `./contracts.ts`). Repeating the node leaves an already-accepted request
 * untouched.
 */
export const run: WorkflowRunFunction = async (
  rawArgs,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const requestId = readRequestId(rawArgs);
  const steps = options.services.resolve(serviceRequestWorkflowStepsToken);
  const result = await steps.registerAcceptance({ requestId });
  options.logger.info('Service request acceptance registered', { requestId });
  // A named interface has no implicit index signature, so copy the fields into
  // the plain object the Run result contract accepts.
  return {
    requestId: result.requestId,
    assigneeId: result.assigneeId,
    urgent: result.urgent,
    title: result.title,
  };
};
