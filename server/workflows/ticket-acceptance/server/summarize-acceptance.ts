import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';
import { accessServiceToken, ticketServiceToken } from './service-tokens.ts';

/**
 * Common successor after either acceptance branch. It reads the ticket back
 * and records the resulting status, so a completed run shows the observable
 * effect of the branch that ran.
 */
export const run: WorkflowRunFunction = async (rawArgs, options) => {
  options.signal.throwIfAborted();
  const args = rawArgs as {
    ticketId?: unknown;
    operatorId?: unknown;
    urgency?: unknown;
  };
  const ticketId = Number(args.ticketId);
  const operatorId = typeof args.operatorId === 'string' ? args.operatorId : '';
  if (!Number.isFinite(ticketId) || !operatorId) {
    throw new Error(
      'ticketId and operatorId are required to summarize acceptance.',
    );
  }
  const access = options.services.resolve(accessServiceToken);
  const actor = await access.resolveActor(operatorId);
  const ticket = await options.services
    .resolve(ticketServiceToken)
    .getTicket(actor, ticketId);
  const urgency = typeof args.urgency === 'string' ? args.urgency : 'normal';
  options.logger.info('Acceptance summarized', {
    ticketId,
    code: ticket.code,
    status: ticket.status,
    urgency,
  });
  return { code: ticket.code, status: ticket.status, urgency };
};
