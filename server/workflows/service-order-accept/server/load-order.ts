import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { databaseManagerToken } from '@nocobase/db';

/**
 * Reads the service order the acceptance branches need: current status,
 * priority, the assigned engineer profile and the confidentiality flag. The
 * condition node uses these values; it also lets the branches detect an
 * already-accepted order instead of advancing it a second time.
 */
export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const orderId = Number((rawArgs as { orderId?: unknown }).orderId);
  if (!Number.isFinite(orderId)) {
    throw new Error('orderId is required.');
  }

  const database = options.services.resolve(databaseManagerToken);
  const row = await database
    .query()
    .selectFrom('serviceOrders')
    .select(['id', 'status', 'priority', 'assigneeProfileId', 'confidential'])
    .where('id', '=', orderId)
    .executeTakeFirst();
  if (!row) {
    throw new Error(`Service order ${orderId} was not found.`);
  }

  return {
    orderId: Number(row.id),
    status: String(row.status),
    priority: String(row.priority),
    assigneeProfileId:
      row.assigneeProfileId == null ? null : Number(row.assigneeProfileId),
    confidential: Boolean(row.confidential),
  };
};
