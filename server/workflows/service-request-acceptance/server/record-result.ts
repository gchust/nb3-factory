import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import {
  readRequestId,
  serviceRequestWorkflowStepsToken,
} from './contracts.ts';

/**
 * Persist the derived normal/urgent result. The database work lives in the
 * application's step service because this module is copied into an isolated
 * Artifact store in production and cannot import `@nocobase/db` from there; see
 * `./contracts.ts`. The update only fills a still-empty result, so a retried run
 * cannot overwrite the recorded outcome.
 */
export const run: WorkflowRunFunction = async (
  rawArgs,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const requestId = readRequestId(rawArgs);
  const result = (rawArgs as { result?: unknown } | null)?.result;
  if (result !== 'normal' && result !== 'urgent') {
    throw new Error('result must be "normal" or "urgent".');
  }
  const steps = options.services.resolve(serviceRequestWorkflowStepsToken);
  await steps.recordResult({ requestId, result });
  options.logger.info('Service request result recorded', { requestId, result });
  return null;
};
