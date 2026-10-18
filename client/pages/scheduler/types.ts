/** The shapes the Scheduler plugin's `/api/scheduler/schedules` routes answer with. */

export type ScheduleOccurrenceStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'timed_out'
  | 'triggered';

export type ScheduleTargetState = 'ready' | 'disabled' | 'missing' | 'invalid';

export interface Schedule {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly lifecycleState: 'active' | 'inactive';
  readonly inactiveReason?: string;
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
  readonly scheduleStatus: 'active' | 'paused';
  readonly targetState: ScheduleTargetState;
  readonly targetSummary: {
    readonly targetLabel: string;
    readonly description?: string;
    readonly href?: string;
    readonly state?: ScheduleTargetState;
  };
}

export interface ScheduleList {
  readonly data: Schedule[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

export interface ScheduleOccurrence {
  readonly id: string;
  readonly scheduleId: string;
  readonly status: ScheduleOccurrenceStatus;
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

export interface ScheduleOccurrenceList {
  readonly data: ScheduleOccurrence[];
  readonly meta: { readonly nextPageToken?: string };
}
