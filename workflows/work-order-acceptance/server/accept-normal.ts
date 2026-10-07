import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';

import { readOrder } from './order.js';

interface Input {
  readonly workOrderId: string;
  readonly orderNo: string;
  readonly priority: 'urgent' | 'normal';
}

interface NormalResult {
  readonly branch: 'normal';
  readonly accepted: boolean;
  readonly status: string;
  readonly assigneeId: string | null;
}

/**
 * The normal branch: audit the acceptance a supervisor performed by hand.
 *
 * A normal order is never auto-assigned, so this node reads the order and
 * reports whether it has been accepted. Triggering it before a supervisor
 * accepted the order records `accepted: false`; the order stays 待受理, which is
 * exactly what the run record explains.
 */
export async function run(
  { input }: { readonly input: Input },
  { services }: WorkflowRunOptions,
): Promise<NormalResult> {
  const database = services.resolve<DatabaseManager>(databaseManagerToken);
  const order = await readOrder(database, input.workOrderId);
  if (!order) {
    throw new Error(`Work order ${input.workOrderId} was not found`);
  }
  return {
    branch: 'normal',
    accepted: order.status !== 'pending_acceptance',
    status: order.status,
    assigneeId: order.assigneeId ?? null,
  };
}
