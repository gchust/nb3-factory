import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { databaseManagerToken } from '@nocobase/db';

/**
 * Runs a registered Scheduler task on demand, through the same target and the
 * same execution records the timed firing uses.
 *
 * `@nocobase/app-plugin-scheduler` exposes no "run now" entry point: its public
 * surface is the `schedulerServiceToken` (register/define only), the schedule
 * definitions it copies into the database, and its settings pages. A short
 * cycle would still wait for the clock, and re-defining the schedule would
 * replace the administrator's cron and enable/disable state. So an on-demand
 * run has to borrow the executor the plugin itself drives:
 *
 *  - the target is the one this application registered, addressed by its
 *    schedule id, so the business result and its failures are the real ones;
 *  - `ScheduleStart`/`ScheduleEnd`/`ScheduleError` are recorded with the same
 *    service the plugin's own subscriber calls, so the schedule's trigger
 *    count, last trigger time and execution records update exactly as they do
 *    for a timed firing;
 *  - `occurrenceId` is unique per click, so two clicks are two records and a
 *    redelivery is deduplicated by the store's compare-and-set.
 *
 * The runner is reached through the executor's runtime `runner` field because
 * the package declares it private while documenting the `ScheduleRunner`
 * interface it holds. There is no public alternative; this stays a structural
 * read, not a deep import of a private module.
 */

/**
 * The scope the plugin registers its executors under. Declared in the plugin's
 * provider but not publicly exported, so it is repeated here; it must match, or
 * `getScheduleExecutor` hands back a different executor with no handlers.
 */
const SCHEDULER_SCOPE = '@nocobase/app-plugin-scheduler';

/** Only the shape this module reads from the plugin's scheduler service. */
interface ScheduleEventRecorder {
  recordEvent(event: {
    name: 'ScheduleStart' | 'ScheduleEnd' | 'ScheduleError';
    jobId: string;
    jobName: string;
    scheduledAt: Date;
    runAt: Date;
    nextRunAt?: Date;
    reason?: 'handler-not-registered' | 'execute-failed';
    error?: Error;
  }): Promise<void>;
}

interface ScheduleRunContext {
  jobId: string;
  scheduledAt: Date;
  runAt: Date;
  nextRunAt?: Date;
  signal: AbortSignal;
}

interface ScheduleRunnerLike {
  run(context: ScheduleRunContext): Promise<void>;
}

/** The runtime executor exposes its backend runner behind a private field. */
interface ExecutorWithRunner {
  runner?: ScheduleRunnerLike;
}

export interface ScheduleRunOutcome {
  /** The schedule definition that was fired, as the Scheduler pages show it. */
  readonly scheduleId: string;
  /** The execution record this run created. */
  readonly occurrenceId: string;
  readonly status: string;
  readonly reason: string | null;
  /** The target's own result, the same object a direct call would return. */
  readonly result: Record<string, unknown>;
}

function dateValue(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  if (typeof value === 'string') {
    if (/^\d+(?:\.0+)?$/.test(value)) {
      const parsed = new Date(Number(value));
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return {};
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * Fires one schedule now and returns what the Scheduler recorded.
 *
 * Returns `undefined` when this installation cannot route the call through the
 * Scheduler — the plugin is not registered, the definition has not been
 * synchronized yet, or the executor has no runner — so the caller can fall back
 * to the plain business operation and stay working.
 */
export async function runScheduleNow(
  app: Application,
  scheduleKey: string,
): Promise<ScheduleRunOutcome | undefined> {
  if (!app.container.has(schedulerServiceToken)) {
    return undefined;
  }
  const database = app.container.resolve(databaseManagerToken);
  const definition = await database
    .query('main')
    .selectFrom('schedule_definitions')
    .select(['id', 'nextRunAt'])
    .where('appName', '=', app.appName)
    .where('key', '=', scheduleKey)
    .executeTakeFirst<{ id: string; nextRunAt: unknown }>();
  if (!definition) {
    return undefined;
  }

  const service = app.container.resolve(
    schedulerServiceToken,
  ) as unknown as ScheduleEventRecorder;
  // The plugin resolves its executor with this same configuration name, and the
  // jobs service caches by (configuration, scope); a different name would build
  // a second executor whose handler table has none of the plugin's schedules.
  const jobsName = app.config.get<string>('scheduler.jobs');
  const executor = app.container
    .resolve(jobExecutorServiceToken)
    .getScheduleExecutor(SCHEDULER_SCOPE, jobsName);
  const runner = (executor as unknown as ExecutorWithRunner).runner;
  if (!runner) {
    return undefined;
  }

  const scheduleId = String(definition.id);
  const now = new Date();
  const occurrenceId = `${scheduleId}:manual:${Date.now()}.${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  // Keep the plan's next timed firing: the store writes `nextRunAt` from every
  // event it records, so omitting it here would clear the schedule's next run.
  const nextRunAt = dateValue(definition.nextRunAt);
  const base = {
    jobId: occurrenceId,
    jobName: scheduleId,
    scheduledAt: now,
    runAt: now,
    ...(nextRunAt ? { nextRunAt } : {}),
  };

  await service.recordEvent({ name: 'ScheduleStart', ...base });
  try {
    await runner.run({ ...base, signal: AbortSignal.timeout(120_000) });
  } catch (error) {
    await service.recordEvent({
      name: 'ScheduleError',
      ...base,
      reason: 'execute-failed',
      error: error instanceof Error ? error : new Error(String(error)),
    });
    throw error;
  }
  await service.recordEvent({ name: 'ScheduleEnd', ...base });

  const occurrence = await database
    .query('main')
    .selectFrom('schedule_occurrences')
    .select(['status', 'reason', 'resultSummary'])
    .where('id', '=', occurrenceId)
    .executeTakeFirst<{
      status: string;
      reason: string | null;
      resultSummary: unknown;
    }>();

  return {
    scheduleId,
    occurrenceId,
    status: occurrence ? String(occurrence.status) : 'completed',
    reason: occurrence?.reason ? String(occurrence.reason) : null,
    result: jsonObject(occurrence?.resultSummary),
  };
}
