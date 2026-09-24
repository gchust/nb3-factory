import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { databaseManagerToken } from '@nocobase/db';

interface ServiceRequestRow {
  id: number | string;
  status: string;
  result?: string | null;
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
 * Record the normal branch result on an accepted request. Idempotent: writing
 * the same result twice is harmless.
 */
const run: WorkflowRunFunction = async (
  rawArgs,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const requestId = readRequestId(rawArgs as Record<string, unknown>);
  const database = options.services.resolve(databaseManagerToken);
  await database.repository<ServiceRequestRow>('serviceRequests').updateMany({
    filter: { ...idFilter(requestId), status: 'accepted' },
    values: { result: 'normal', updatedAt: new Date() },
  });
  return { result: 'normal' };
};

export { run };
