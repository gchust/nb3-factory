import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { serviceTicketServiceToken } from './service-tokens.js';

/**
 * The single acceptance step both priority branches reach. `automaticAccept`
 * assigns the least-loaded engineer, performs the state-guarded transition,
 * writes the idempotency journal row, and notifies the assignee. It is
 * idempotent, so a retried run returns `already_handled` instead of accepting
 * twice. A real failure is recorded on the ticket by the service; this script
 * additionally notifies supervisors and re-throws so the run is marked failed.
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
  try {
    const outcome = await tickets.automaticAccept(ticketId);
    options.logger.info('Ticket acceptance resolved', {
      ticketId,
      status: outcome.status,
      assigneeId: outcome.assigneeId,
    });
    return { status: outcome.status, assigneeId: outcome.assigneeId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await tickets.notifyAcceptanceFailure(ticketId, message);
    options.logger.error('Ticket acceptance failed', { ticketId, message });
    throw error;
  }
};
