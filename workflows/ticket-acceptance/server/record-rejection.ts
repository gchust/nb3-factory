import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import { ticketServiceToken } from './tokens.js';
import type { FlowContext } from '../workflow';

/**
 * Record a refused or impossible acceptance. An explicit refusal closes the
 * ticket with the reason; a ticket that could not be accepted because it is
 * missing or already moved on leaves a retryable failure step, which is what
 * the operations page lists and lets an operator retry.
 */
export async function run(
  { input, nodeResults }: FlowContext,
  { services }: WorkflowRunOptions,
): Promise<{ recorded: boolean; reason: string; retryable: boolean }> {
  const service = services.resolve(ticketServiceToken);
  const loaded = nodeResults.loadTicket;

  if (loaded && loaded.found && input.accept === false) {
    await service.rejectTicket(
      input.ticketId,
      { id: input.actorId, name: input.actorName },
      input.reason ?? 'refused during acceptance',
    );
    return { recorded: true, reason: 'refused', retryable: false };
  }

  const reason =
    !loaded || !loaded.found
      ? `ticket ${input.ticketId} was not found`
      : `ticket ${loaded.ticketNo} is ${loaded.status}`;
  await service.recordStep({
    ticketId: input.ticketId,
    step: 'acceptance',
    status: 'failed',
    message: reason,
    retryable: true,
    eventKey: `ticket-acceptance:${input.ticketId}`,
  });
  return { recorded: true, reason, retryable: true };
}
