import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { readRequestId, registerAcceptance } from './acceptance.js';

export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const requestId = readRequestId(
    (rawArgs as { requestId?: unknown }).requestId,
  );
  const result = await registerAcceptance(options, requestId);
  options.logger.info('Service request acceptance registered', { requestId });
  return result;
};
