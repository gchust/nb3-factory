import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import { ticketServiceToken } from './tokens.js';
import type { FlowContext } from '../workflow';

/**
 * Apply the acceptance inside the workflow attempt: the ticket moves from
 * pending acceptance to pending handling, gets its owner, and both the ticket
 * log and the owner's in-app notification are written. A failure here fails
 * the node so the run keeps a retryable record.
 */
export async function run(
  { input }: FlowContext,
  { services }: WorkflowRunOptions,
): Promise<{
  accepted: boolean;
  ticketNo: string;
  ownerId: string;
  status: string;
}> {
  const service = services.resolve(ticketServiceToken);
  const record = await service.applyAcceptance(
    input.ticketId,
    { id: input.actorId, name: input.actorName },
    {
      ownerId: input.ownerId ?? null,
      priority: input.priority,
      acceptedAt: new Date().toISOString(),
    },
  );
  return {
    accepted: true,
    ticketNo: record.ticketNo,
    ownerId: record.ownerId ?? '',
    status: record.status,
  };
}
