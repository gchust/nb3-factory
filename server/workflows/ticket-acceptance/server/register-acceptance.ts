import type {
  WorkflowRunFunction,
  WorkflowRunOptions,
} from '@nocobase/app-plugin-workflow';

import { loadServiceTokens } from './app-services.js';

/**
 * The shared terminal step of both acceptance branches. Which branch ran is
 * decided by the Workflow's condition node, and it only changes the wording of
 * the acceptance note, so both branches delegate here with their note kind.
 */
export interface AcceptanceNodeResult {
  ticketId: number;
  ticketNo: string;
  status: string;
  assigneeId: number | null;
  assigneeName: string | null;
  note: string;
}

export function registerAcceptanceNode(
  noteKind: 'normal' | 'urgent',
): WorkflowRunFunction {
  return async (
    rawArgs: unknown,
    options: WorkflowRunOptions,
  ): Promise<AcceptanceNodeResult> => {
    options.signal.throwIfAborted();
    const args = rawArgs as { ticketId?: unknown; actorId?: unknown };
    if (
      typeof args.ticketId !== 'number' ||
      !Number.isInteger(args.ticketId) ||
      args.ticketId < 1
    ) {
      throw new Error('ticketId must be a positive integer.');
    }
    if (typeof args.actorId !== 'string' || args.actorId.length === 0) {
      throw new Error('actorId is required.');
    }
    const tokens = await loadServiceTokens();
    if (!options.services.has(tokens.ticketServiceToken)) {
      throw new Error(
        'The ticket service is not available to the acceptance Workflow.',
      );
    }
    const tickets = options.services.resolve(tokens.ticketServiceToken);
    // The service method is idempotent and supervisor-guarded, so a retried
    // node attempt cannot accept twice or notify the engineer twice.
    const result = await tickets.registerAcceptance(args.ticketId, {
      actorId: args.actorId,
      noteKind,
    });
    options.signal.throwIfAborted();
    options.logger.info('Ticket acceptance registered', {
      ticketId: result.ticketId,
      noteKind,
      status: result.status,
      via: 'workflow',
    });
    return {
      ticketId: result.ticketId,
      ticketNo: result.ticketNo,
      status: result.status,
      assigneeId: result.assigneeId,
      assigneeName: result.assigneeName,
      note: result.note ?? '',
    };
  };
}
