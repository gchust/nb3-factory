import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';
import { databaseManagerToken } from '@nocobase/db';

// Registers the acceptance note for the branch the work order's priority chose.
// Acceptance itself already happened in the application service; this only
// records the wording, and it is idempotent so a retried run never overwrites a
// note a supervisor wrote by hand.
interface WorkOrderRow {
  id: string;
  code: string;
  acceptanceNote: string | null;
  updatedAt: Date;
}

export const run: WorkflowRunFunction = async (rawArgs, options) => {
  options.signal.throwIfAborted();
  const workOrderId = readString(rawArgs, 'workOrderId');
  const note = readString(rawArgs, 'note');
  const database = options.services.resolve(databaseManagerToken);
  const repository = database.repository<WorkOrderRow>('workOrders');
  const row = await repository.findOne({
    filter: (filter) => filter.string('id').eq(workOrderId),
  });
  if (!row) {
    throw new Error(`Work order ${workOrderId} was not found`);
  }
  const existing = row.acceptanceNote?.trim();
  if (existing) {
    return { workOrderId, applied: false, note: existing };
  }
  await repository.updateOne({
    filter: (filter) => filter.string('id').eq(workOrderId),
    values: { acceptanceNote: note, updatedAt: new Date() },
  });
  return { workOrderId, applied: true, note };
};

function readString(rawArgs: unknown, key: string): string {
  const value = (rawArgs as Record<string, unknown> | null)?.[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Run argument "${key}" must be a non-empty string`);
  }
  return value;
}
