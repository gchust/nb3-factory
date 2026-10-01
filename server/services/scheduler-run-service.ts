import { Schedule, type AppQueueConfig } from '@nocobase/queue';

/**
 * Occurrence states the Scheduler already treats as finished. A manual run
 * waits for one of these before reporting, so a failure is never presented as
 * a completion.
 */
const TERMINAL_STATUSES = new Set([
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
  'timed_out',
  'triggered',
]);

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_MS = 250;

/** A schedule row as the Scheduler's `list()` returns it. */
export interface ScheduleListEntry {
  readonly id: string;
  readonly key: string;
  readonly enabled: boolean;
  readonly lifecycleState: string;
}

/** An execution record as the Scheduler's occurrence list returns it. */
export interface ScheduleOccurrenceView {
  readonly id: string;
  readonly scheduleId: string;
  readonly status: string;
  readonly reason?: string;
  readonly resultSummary?: unknown;
}

/**
 * The narrow read surface this service relies on. The Scheduler's public token
 * only advertises target registration and schedule declaration, so the
 * application declares the shape it reads here, beside its only consumer.
 */
export interface SchedulerReadService {
  list(): Promise<readonly ScheduleListEntry[]>;
  listOccurrences(
    scheduleId: string,
  ): Promise<readonly ScheduleOccurrenceView[]>;
}

export type ScheduleExecutionState =
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'timed_out'
  | 'triggered'
  | 'running'
  | 'pending'
  | 'waiting'
  | 'disabled'
  | 'missing';

/** What happened to one named schedule during a manual run. */
export interface ScheduleExecutionOutcome {
  readonly key: string;
  readonly scheduleId?: string;
  readonly state: ScheduleExecutionState;
  readonly occurrenceId?: string;
  readonly reason?: string;
  readonly result?: unknown;
}

export interface SchedulerRunOptions {
  /** Queue the Scheduler's dispatch job is declared on. */
  readonly queueName: string;
  /** How long to wait for a triggered occurrence to reach a terminal state. */
  readonly timeoutMs?: number;
  /** Delay between occurrence polls while waiting. */
  readonly pollMs?: number;
}

/**
 * Runs the Scheduler's own registered schedules on demand.
 *
 * The Scheduler deliberately has no "run now" route, but the Queue package it
 * builds on exposes `Schedule.trigger()` — the same call the Queue worker makes
 * for a schedule whose time has come. Triggering here dispatches the
 * Scheduler's own `ScheduleDispatchJob` through the same registered target and
 * writes the same `schedule_occurrences` row and `runCount`/`lastRunAt` update
 * a cron firing would, so a manual run is indistinguishable from a scheduled
 * one in the plan's execution records. Deduplication stays where it belongs:
 * the business targets are idempotent per device/ticket and calendar day, so a
 * repeated manual run never creates a second inspection or reminder.
 *
 * A missing or disabled schedule is reported, not run — the manual trigger
 * honors the same switch the Scheduler's own administration does.
 */
export class SchedulerRunService {
  private readonly config: AppQueueConfig;
  private readonly scheduler: SchedulerReadService;
  private readonly queueName: string;
  private readonly timeoutMs: number;
  private readonly pollMs: number;

  constructor(
    config: AppQueueConfig,
    scheduler: SchedulerReadService,
    options: SchedulerRunOptions,
  ) {
    this.config = config;
    this.scheduler = scheduler;
    this.queueName = options.queueName;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  }

  /** Trigger every named schedule and wait for each occurrence to finish. */
  async runAll(
    keys: readonly string[],
  ): Promise<readonly ScheduleExecutionOutcome[]> {
    const entries = await this.scheduler.list();
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    const outcomes = new Map<string, ScheduleExecutionOutcome>();
    const pending: Array<{
      key: string;
      entry: ScheduleListEntry;
      before: Set<string>;
    }> = [];

    for (const key of keys) {
      const entry = byKey.get(key);
      if (!entry) {
        outcomes.set(key, { key, state: 'missing' });
        continue;
      }
      if (!entry.enabled || entry.lifecycleState !== 'active') {
        outcomes.set(key, { key, scheduleId: entry.id, state: 'disabled' });
        continue;
      }
      const before = new Set(
        (await this.scheduler.listOccurrences(entry.id)).map(
          (occurrence) => occurrence.id,
        ),
      );
      outcomes.set(key, { key, scheduleId: entry.id, state: 'pending' });
      pending.push({ key, entry, before });
    }

    if (pending.length > 0) {
      await this.dispatch(pending.map(({ entry }) => entry.id));
      const settled = await Promise.all(
        pending.map(async ({ key, entry, before }) => ({
          key,
          entry,
          occurrence: await this.waitForTerminal(entry.id, before),
        })),
      );
      for (const { key, entry, occurrence } of settled) {
        outcomes.set(
          key,
          occurrence
            ? this.toOutcome(key, entry, occurrence)
            : {
                key,
                scheduleId: entry.id,
                state: 'running',
              },
        );
      }
    }

    return keys.map(
      (key) => outcomes.get(key) ?? { key, state: 'missing' as const },
    );
  }

  /**
   * Trigger each schedule through the Queue's public API. The schedule was
   * already confirmed enabled and active by the preceding `list()` read.
   */
  private async dispatch(scheduleIds: readonly string[]): Promise<void> {
    const adapter = this.scheduleAdapter();
    await Promise.all(
      scheduleIds.map(async (scheduleId) => {
        const schedule = await Schedule.find(scheduleId, { adapter });
        if (schedule) {
          await schedule.trigger();
        }
      }),
    );
  }

  /**
   * The connection the Scheduler's queue is configured on. The Queue package
   * resolves it from the same configuration; the application reads it so
   * `Schedule.find` can address the adapter that holds the schedule rows.
   */
  private scheduleAdapter(): string {
    const connection =
      this.config.queues?.[this.queueName]?.connection ?? this.config.default;
    if (!this.config.connections[connection]) {
      throw new Error(
        `Queue "${this.queueName}" references unconfigured connection "${connection}".`,
      );
    }
    return connection;
  }

  /**
   * Wait for an occurrence that did not exist before the trigger to reach a
   * terminal state. The Queue's `trigger()` returns no job id, so the new
   * occurrence is identified by comparing against the ids captured first.
   */
  private async waitForTerminal(
    scheduleId: string,
    before: ReadonlySet<string>,
  ): Promise<ScheduleOccurrenceView | undefined> {
    const deadline = Date.now() + this.timeoutMs;
    let latest: ScheduleOccurrenceView | undefined;
    for (;;) {
      const occurrences = await this.scheduler.listOccurrences(scheduleId);
      latest = occurrences.find((occurrence) => !before.has(occurrence.id));
      if (latest && TERMINAL_STATUSES.has(latest.status)) {
        return latest;
      }
      if (Date.now() >= deadline) {
        return latest;
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
  }

  private toOutcome(
    key: string,
    entry: ScheduleListEntry,
    occurrence: ScheduleOccurrenceView,
  ): ScheduleExecutionOutcome {
    return {
      key,
      scheduleId: entry.id,
      state: occurrence.status as ScheduleExecutionState,
      occurrenceId: occurrence.id,
      ...(occurrence.reason ? { reason: occurrence.reason } : {}),
      ...(occurrence.resultSummary === undefined
        ? {}
        : { result: occurrence.resultSummary }),
    };
  }
}
