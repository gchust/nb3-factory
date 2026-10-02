import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import { databaseManagerToken } from '@nocobase/db';

interface RecordAcceptanceNoteArgs {
  workOrderId?: unknown;
  accepted?: unknown;
  alreadyProcessed?: unknown;
  priority?: unknown;
  locale?: unknown;
}

/**
 * The workflow runs without a request, so the locale is carried in its input. The two languages the
 * application offers are the only ones the note can be written in; anything else falls back to English.
 */
function isChinese(locale: unknown): boolean {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('zh');
}

function acceptanceNote(
  locale: unknown,
  accepted: boolean,
  urgent: boolean,
): string {
  if (isChinese(locale)) {
    return accepted
      ? urgent
        ? '紧急工单已受理，请优先处理。'
        : '普通工单已受理，请按计划处理。'
      : '紧急工单已升级至主管，等待受理。';
  }
  return accepted
    ? urgent
      ? 'The urgent work order was accepted; please handle it first.'
      : 'The work order was accepted; please proceed as planned.'
    : 'The urgent work order was escalated to the supervisor and awaits acceptance.';
}

/**
 * Record the acceptance note that matches the priority branch.
 *
 * The two branch nodes call the same module; the note is chosen from the accepted/priority combination the
 * register node returned. A run that found the order already processed writes nothing.
 */
export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const args = rawArgs as RecordAcceptanceNoteArgs;
  const workOrderId = Number(args.workOrderId);
  if (!Number.isInteger(workOrderId) || workOrderId <= 0) {
    throw new Error('workOrderId must be a positive integer.');
  }
  const accepted = args.accepted === true;
  const alreadyProcessed = args.alreadyProcessed === true;
  const priority = typeof args.priority === 'string' ? args.priority : '';
  const urgent = priority === 'high' || priority === 'urgent';

  if (alreadyProcessed) {
    return { noted: false };
  }

  const note = acceptanceNote(args.locale, accepted, urgent);

  const database = options.services.resolve(databaseManagerToken);
  const now = new Date();
  await database
    .connection()
    .repository<Record<string, unknown>>('serviceWorkOrders')
    .updateMany({
      filter: { id: workOrderId },
      values: { acceptanceNote: note, updatedAt: now },
    });
  options.logger.info('Acceptance note recorded', { workOrderId, priority });
  return { noted: true };
};
