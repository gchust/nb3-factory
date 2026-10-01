import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

// A terminal node whose only job is to leave a readable summary in the run
// history, so an operator can see which branch executed without opening each
// node run.
export const run: WorkflowRunFunction = async (rawArgs, options) => {
  options.signal.throwIfAborted();
  const workOrderId = readString(rawArgs, 'workOrderId');
  const code = readString(rawArgs, 'code');
  const priority = readString(rawArgs, 'priority');
  return {
    workOrderId,
    code,
    priority,
    branch: priority === 'urgent' ? 'urgent' : 'normal',
  };
};

function readString(rawArgs: unknown, key: string): string {
  const value = (rawArgs as Record<string, unknown> | null)?.[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Run argument "${key}" must be a non-empty string`);
  }
  return value;
}
