import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { notifyAssignee, readRequestId } from './acceptance.js';

export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const args = rawArgs as {
    requestId?: unknown;
    locale?: unknown;
    assigneeId?: unknown;
    urgent?: unknown;
    title?: unknown;
  };
  const requestId = readRequestId(args.requestId);
  await notifyAssignee(options, {
    requestId,
    locale:
      typeof args.locale === 'string' && args.locale ? args.locale : 'en-US',
    assigneeId:
      typeof args.assigneeId === 'string' && args.assigneeId
        ? args.assigneeId
        : null,
    urgent: args.urgent === true,
    title: typeof args.title === 'string' ? args.title : '',
  });
  options.logger.info('Service request assignee notified', { requestId });
  return null;
};
