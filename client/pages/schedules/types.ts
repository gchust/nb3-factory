/** A schedule as `GET /api/scheduler/schedules` returns it (`@nocobase/app-plugin-scheduler`). */
export interface Schedule {
  readonly id: string;
  readonly appName: string;
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly targetType: string;
  readonly lifecycleState: 'active' | 'inactive';
  readonly inactiveReason?: string;
  readonly definitionHash: string;
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
  readonly scheduleStatus: 'active' | 'paused';
  readonly targetState: 'ready' | 'disabled' | 'missing' | 'invalid';
  readonly targetSummary: {
    readonly targetLabel: string;
    readonly description?: string;
    readonly href?: string;
    readonly state?: string;
  };
}

export type OccurrenceStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'timed_out'
  | 'triggered';

/** One firing of a schedule, as `GET /api/scheduler/schedules/:id/occurrences` returns it. */
export interface Occurrence {
  readonly id: string;
  readonly scheduleId: string;
  readonly status: OccurrenceStatus;
  readonly reason?: string;
  readonly executionCount: number;
  readonly startedAt: string;
  readonly acceptedAt?: string;
  readonly finishedAt?: string;
  readonly targetReceipt?: Readonly<Record<string, unknown>>;
  readonly resultSummary?: Readonly<Record<string, unknown>>;
  readonly target: {
    readonly type: string;
    readonly reference?: { readonly type: string; readonly id: string };
    readonly href?: string;
  };
}
