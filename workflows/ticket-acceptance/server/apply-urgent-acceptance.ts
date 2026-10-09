import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import { ticketServiceToken } from './tokens.js';
import type { FlowContext } from '../workflow';

/** The acceptance note recorded for an urgent ticket. */
export const URGENT_ACCEPTANCE_NOTE =
  '受理说明：紧急工单，已登记受理，请优先处理并尽快反馈。';

/**
 * Apply acceptance on the urgent branch: move the ticket to pending handling
 * with its owner and priority, stamp the accepted time, and record the urgent
 * acceptance note plus the owner's priority in-app notification. A failure
 * fails the node so the run keeps a retryable record.
 */
export async function run(
  { input }: FlowContext,
  { services }: WorkflowRunOptions,
): Promise<{
  accepted: boolean;
  ticketNo: string;
  ownerId: string;
  status: string;
  note: string;
}> {
  const service = services.resolve(ticketServiceToken);
  const record = await service.applyAcceptance(
    input.ticketId,
    { id: input.actorId, name: input.actorName },
    {
      ownerId: input.ownerId ?? null,
      priority: input.priority,
      acceptedAt: new Date().toISOString(),
      note: URGENT_ACCEPTANCE_NOTE,
    },
  );
  return {
    accepted: true,
    ticketNo: record.ticketNo,
    ownerId: record.ownerId ?? '',
    status: record.status,
    note: URGENT_ACCEPTANCE_NOTE,
  };
}
