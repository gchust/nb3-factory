/** The Scheduler's own view of whether a target type can run: see the plugin's API document. */
export type ScheduleTargetState = 'ready' | 'disabled' | 'missing' | 'invalid';

export type ScheduleStatus = 'active' | 'paused';

export type ScheduleLifecycleState = 'active' | 'inactive';

export interface ScheduleTargetSummary {
  readonly targetLabel: string;
  readonly description?: string;
  readonly href?: string;
  readonly state?: ScheduleTargetState;
}

/** One Schedule as `GET /api/scheduler/schedules` returns it. */
export interface Schedule {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly targetType: string;
  readonly lifecycleState: ScheduleLifecycleState;
  readonly inactiveReason?: string;
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
  readonly scheduleStatus: ScheduleStatus;
  readonly targetState: ScheduleTargetState;
  readonly targetSummary: ScheduleTargetSummary;
}

export interface ScheduleList {
  readonly data: Schedule[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
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

/** One firing of a Schedule, as `GET /api/scheduler/schedules/:scheduleId/occurrences` returns it. */
export interface ScheduleOccurrence {
  readonly id: string;
  readonly scheduleId: string;
  readonly status: OccurrenceStatus;
  readonly reason?: string;
  readonly executionCount: number;
  readonly startedAt: string;
  readonly acceptedAt?: string;
  readonly finishedAt?: string;
  readonly resultSummary?: Record<string, unknown>;
  readonly target: {
    readonly type: string;
    readonly reference?: { readonly type: string; readonly id: string };
    readonly href?: string;
  };
}

export interface OccurrenceList {
  readonly data: ScheduleOccurrence[];
  readonly meta: { readonly nextPageToken?: string };
}
