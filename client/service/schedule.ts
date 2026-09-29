import type { ServiceApi } from './api.js';
import type { ServiceScheduleOccurrence } from './types.js';

/**
 * A controlled run of an application schedule. The button does not run the
 * business logic itself: it asks the server to dispatch through the Scheduler,
 * then reads the execution record the Scheduler wrote, so the result shown to
 * the user is the one the Scheduler recorded — not an assumption.
 */
export type ScheduleRunStatus =
  'succeeded' | 'skipped' | 'failed' | 'pending' | 'disabled' | 'unavailable';

export interface ScheduleRunOutcome {
  readonly status: ScheduleRunStatus;
  readonly created?: number;
  readonly sent?: number;
  readonly reason?: string;
}

/** Occurrence states a wait may stop on; every other state may still change. */
const TERMINAL_OCCURRENCE_STATES = new Set([
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
  'timed_out',
]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function countOf(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function readOutcome(
  occurrence: ServiceScheduleOccurrence,
): ScheduleRunOutcome {
  if (occurrence.status === 'succeeded') {
    const summary = occurrence.resultSummary;
    return {
      status: 'succeeded',
      created: countOf(summary?.created),
      sent: countOf(summary?.sent),
    };
  }
  if (occurrence.status === 'skipped') {
    return { status: 'skipped', reason: occurrence.reason };
  }
  return { status: 'failed', reason: occurrence.reason };
}

/**
 * Trigger a schedule through the server and wait for the Scheduler to record a
 * terminal occurrence. The occurrence set is snapshotted first so the result
 * belongs to this run and not to an earlier scheduled tick.
 */
export async function runScheduleAndAwait(
  api: ServiceApi,
  key: string,
  timeoutMs = 30_000,
): Promise<ScheduleRunOutcome> {
  let before: Set<string> | undefined;
  try {
    const schedules = await api.listSchedules();
    const schedule = schedules.find((row) => row.key === key);
    if (!schedule) {
      return { status: 'unavailable' };
    }
    if (!schedule.enabled) {
      return { status: 'disabled' };
    }
    before = new Set(
      (await api.listScheduleOccurrences(schedule.id)).map((row) => row.id),
    );
  } catch {
    // The plan can still be dispatched without the Scheduler read grant; its
    // record simply cannot be observed here, so report an unconfirmed result.
    before = undefined;
  }

  const run = await api.runSchedule(key);
  if (!before) {
    return { status: 'pending' };
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await delay(500);
    const occurrences = await api.listScheduleOccurrences(run.scheduleId);
    const fresh = occurrences.find((row) => !before.has(row.id));
    if (fresh && TERMINAL_OCCURRENCE_STATES.has(fresh.status)) {
      return readOutcome(fresh);
    }
  }
  return { status: 'pending' };
}
