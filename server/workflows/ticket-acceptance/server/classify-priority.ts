import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { serviceTicketServiceToken } from './service-tokens.js';

interface ClassifyPriorityResult {
  [key: string]: WorkflowRunJsonValue;
  priority: string;
  highPriority: boolean;
  handled: boolean;
}

/**
 * Read the ticket through the application ticket service and report the
 * priority classification the acceptance branch needs. This is a pure read; the
 * acceptance itself happens once, in the common final step.
 */
export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const ticketId = Number((rawArgs as { ticketId?: unknown }).ticketId);
  if (!Number.isInteger(ticketId)) {
    throw new Error('ticketId must be an integer.');
  }
  const tickets = options.services.resolve(serviceTicketServiceToken);
  const plan = await tickets.acceptancePlan(ticketId);
  const result: ClassifyPriorityResult = {
    priority: plan.priority,
    highPriority: plan.highPriority,
    handled: plan.handled,
  };
  options.logger.info('Ticket priority classified', {
    ticketId,
    priority: result.priority,
    highPriority: result.highPriority,
  });
  return result;
};
