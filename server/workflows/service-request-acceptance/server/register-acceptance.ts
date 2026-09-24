import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { databaseManagerToken } from '@nocobase/db';

interface ServiceRequestRow {
  id: number | string;
  title: string;
  urgent: boolean;
  assigneeId: string;
  status: string;
  acceptedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

function readRequestId(args: Record<string, unknown>): string {
  const value = args.requestId;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('requestId is required.');
  }
  return value.trim();
}

function idFilter(requestId: string): { id: number | string } {
  return /^\d+$/.test(requestId)
    ? { id: Number(requestId) }
    : { id: requestId };
}

/**
 * Mark a pending service request accepted and return the values the rest of
 * the workflow routes and notifies on.
 *
 * Re-running against an already accepted request is a no-op: the guard on
 * `status: 'pending'` means `acceptedAt` is written once, and the node still
 * returns the stored urgency, assignee and title.
 */
const run: WorkflowRunFunction = async (
  rawArgs,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const requestId = readRequestId(rawArgs as Record<string, unknown>);
  const database = options.services.resolve(databaseManagerToken);
  const requests = database.repository<ServiceRequestRow>('serviceRequests');

  const existing = await requests.findOne({ filter: idFilter(requestId) });
  if (!existing) {
    throw new Error(`Service request "${requestId}" was not found.`);
  }

  if (existing.status !== 'accepted') {
    const now = new Date();
    await requests.updateMany({
      filter: { ...idFilter(requestId), status: 'pending' },
      values: { status: 'accepted', acceptedAt: now, updatedAt: now },
    });
  }

  const accepted = await requests.findOne({ filter: idFilter(requestId) });
  if (!accepted) {
    throw new Error(
      `Service request "${requestId}" disappeared during acceptance.`,
    );
  }

  return {
    urgent: Boolean(accepted.urgent),
    assigneeId: String(accepted.assigneeId),
    title: String(accepted.title),
  };
};

export { run };
