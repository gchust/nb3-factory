import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { serviceTicketServiceToken } from './service-tokens.js';

/**
 * Give an ordinary ticket a twenty-four hour response deadline. An existing
 * deadline, or a ticket already accepted, is left untouched.
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
  const { dueAt } = await tickets.applyAcceptanceSla(ticketId, 24);
  options.logger.info('Standard acceptance deadline applied', {
    ticketId,
    dueAt,
  });
  return { dueAt };
};
