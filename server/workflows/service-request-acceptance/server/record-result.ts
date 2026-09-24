import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { readRequestId, recordResult } from './acceptance.js';

export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const args = rawArgs as { requestId?: unknown; result?: unknown };
  const requestId = readRequestId(args.requestId);
  if (args.result !== 'normal' && args.result !== 'urgent') {
    throw new Error('result must be "normal" or "urgent".');
  }
  await recordResult(options, requestId, args.result);
  options.logger.info('Service request acceptance result recorded', {
    requestId,
    result: args.result,
  });
  return null;
};
