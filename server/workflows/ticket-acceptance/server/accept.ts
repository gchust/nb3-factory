import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import { accessServiceToken, ticketServiceToken } from './service-tokens.ts';

export interface AcceptanceArgs {
  ticketId?: unknown;
  operatorId?: unknown;
  acceptNote?: unknown;
}

/**
 * Shared body of the urgent and standard acceptance scripts.
 *
 * The service acceptance is idempotent on the ticket id, so a retried node
 * never accepts twice, never changes an already-accepted status and never
 * sends a second in-app message.
 */
export async function runAcceptance(
  rawArgs: unknown,
  options: WorkflowRunOptions,
  urgency: 'urgent' | 'normal',
): Promise<{
  accepted: boolean;
  changed: boolean;
  status: string;
  urgency: string;
}> {
  options.signal.throwIfAborted();
  const args = rawArgs as AcceptanceArgs;
  const ticketId = Number(args.ticketId);
  const operatorId = typeof args.operatorId === 'string' ? args.operatorId : '';
  if (!Number.isFinite(ticketId) || !operatorId) {
    throw new Error('ticketId and operatorId are required to accept a ticket.');
  }
  const access = options.services.resolve(accessServiceToken);
  const actor = await access.resolveActor(operatorId);
  access.assertMayDecideTicket(actor);
  const result = await options.services
    .resolve(ticketServiceToken)
    .acceptTicket(
      actor,
      ticketId,
      typeof args.acceptNote === 'string' && args.acceptNote
        ? args.acceptNote
        : undefined,
    );
  options.logger.info('Ticket acceptance processed by workflow', {
    ticketId,
    operatorId,
    urgency,
    changed: result.changed,
  });
  return {
    accepted: true,
    changed: result.changed,
    status: result.ticket.status,
    urgency,
  };
}
