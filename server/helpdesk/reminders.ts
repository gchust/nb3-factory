import type { DatabaseManager } from '@nocobase/db';
import {
  LifecycleError,
  SYSTEM_ACTOR,
  createRepositoryLifecycleStore,
  type LifecycleRuntime,
} from '@nocobase/lifecycle';

import { readHelpdeskSettings } from './settings.js';

const LIFECYCLE = 'helpdeskTicket';
const COLLECTION = 'helpdeskTickets';
const BATCH_SIZE = 100;

/** Refusals that mean the record moved on, not that the sweep is broken. */
const EXPECTED_REFUSALS = new Set([
  'RECORD_NOT_FOUND',
  'INVALID_STATE',
  'CONFLICT',
  'GUARD_REJECTED',
]);

export interface OverdueReminderResult {
  readonly candidates: number;
  readonly fired: number;
}

interface OverdueReminderDependencies {
  readonly database: DatabaseManager;
  readonly runtime: Pick<LifecycleRuntime, 'fire'>;
  readonly now?: () => Date;
  readonly store?: ReturnType<typeof createRepositoryLifecycleStore>;
  /** Test seam; production reads the administrator's saved policy. */
  readonly reminderHours?: number;
}

/**
 * Fires the system-only `remind` transition for processing tickets whose last
 * state change is older than the administrator's saved reminder interval.
 *
 * The lifecycle runtime's built-in trigger sweep reads synchronous parameters
 * and cannot see a stored policy registration, so the application runs this
 * sweep with the saved value instead. It is still a normal lifecycle
 * transition: guards, history, effects and notifications all run as they do
 * for a manually fired one. The conditional `changedBefore` expectation makes
 * overlapping sweeps safe.
 */
export async function fireOverdueReminders({
  database,
  runtime,
  now = () => new Date(),
  store = createRepositoryLifecycleStore(database),
  reminderHours,
}: OverdueReminderDependencies): Promise<OverdueReminderResult> {
  const hours =
    reminderHours ?? (await readHelpdeskSettings(database)).reminderHours;
  const changedBefore = new Date(
    now().getTime() - hours * 3_600_000,
  ).toISOString();
  const records = await store.findIdleRecords(COLLECTION, {
    stateField: 'status',
    states: ['processing'],
    changedAtField: 'statusChangedAt',
    changedBefore,
    limit: BATCH_SIZE,
  });

  let fired = 0;
  for (const record of records) {
    try {
      await runtime.fire(LIFECYCLE, record.id, 'remind', {
        actor: SYSTEM_ACTOR,
        expect: { changedBefore },
      });
      fired += 1;
    } catch (error) {
      if (
        error instanceof LifecycleError &&
        EXPECTED_REFUSALS.has(error.code)
      ) {
        continue;
      }
      throw error;
    }
  }

  return { candidates: records.length, fired };
}
