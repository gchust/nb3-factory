import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import { ticketServiceToken } from './tokens.js';
import type { FlowContext } from '../workflow';

/** The acceptance note recorded for a non-urgent ticket. */
export const NORMAL_ACCEPTANCE_NOTE =
  '受理说明：普通工单，已登记受理，请按计划安排处理。';

/**
 * Apply acceptance on the ordinary branch: move the ticket to pending handling
 * with its owner and priority, stamp the accepted time, and record the ordinary
 * acceptance note plus the owner's in-app notification. A failure fails the
 * node so the run keeps a retryable record.
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
      note: NORMAL_ACCEPTANCE_NOTE,
    },
  );
  return {
    accepted: true,
    ticketNo: record.ticketNo,
    ownerId: record.ownerId ?? '',
    status: record.status,
    note: NORMAL_ACCEPTANCE_NOTE,
  };
}
