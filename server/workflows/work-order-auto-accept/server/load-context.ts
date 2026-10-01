import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';
import { databaseManagerToken } from '@nocobase/db';

// Reads the work order the acceptance belongs to. The module only depends on
// package specifiers so the built artifact can be copied to another directory
// without its relative imports breaking.
interface WorkOrderRow {
  id: string;
  code: string;
  priority: string;
  status: string;
  assigneeId: string | null;
}

export const run: WorkflowRunFunction = async (rawArgs, options) => {
  options.signal.throwIfAborted();
  const workOrderId = readString(rawArgs, 'workOrderId');
  const database = options.services.resolve(databaseManagerToken);
  const row = await database.repository<WorkOrderRow>('workOrders').findOne({
    filter: (filter) => filter.string('id').eq(workOrderId),
  });
  if (!row) {
    throw new Error(`Work order ${workOrderId} was not found`);
  }
  return {
    id: row.id,
    code: row.code,
    priority: row.priority,
    status: row.status,
    assigneeId: row.assigneeId,
  };
};

function readString(rawArgs: unknown, key: string): string {
  const value = (rawArgs as Record<string, unknown> | null)?.[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Run argument "${key}" must be a non-empty string`);
  }
  return value;
}
