import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import { ticketServiceToken } from './tokens.js';
import type { FlowContext } from '../workflow';

/** The application's ticket service reports a missing record as this code. */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'NOT_FOUND'
  );
}

/**
 * Read the ticket the acceptance decision applies to. Missing tickets are
 * reported as data instead of an exception so the condition node can route
 * them to the failure branch and leave a durable record.
 */
export async function run(
  { input }: FlowContext,
  { services }: WorkflowRunOptions,
): Promise<{
  found: boolean;
  status: string;
  ticketNo: string;
  ownerId: string;
}> {
  const service = services.resolve(ticketServiceToken);
  try {
    const ticket = await service.getTicket(input.ticketId);
    return {
      found: true,
      status: ticket.status,
      ticketNo: ticket.ticketNo,
      ownerId: ticket.ownerId ?? '',
    };
  } catch (error) {
    if (isNotFound(error)) {
      return {
        found: false,
        status: '',
        ticketNo: input.ticketNo,
        ownerId: '',
      };
    }
    throw error;
  }
}
