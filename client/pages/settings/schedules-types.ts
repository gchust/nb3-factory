/** The scheduler plugin's `GET /scheduler/schedules` projection. */
export interface ScheduleListItem {
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
    readonly state?: 'ready' | 'disabled' | 'missing' | 'invalid';
  };
}

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

export interface ScheduleOccurrence {
  readonly id: string;
  readonly scheduleId: string;
  readonly status: ScheduleOccurrenceStatus;
  readonly reason?: string;
  readonly executionCount: number;
  readonly startedAt: string;
  readonly acceptedAt?: string;
  readonly finishedAt?: string;
  readonly targetReceipt?: Readonly<Record<string, unknown>>;
  readonly resultSummary?: Readonly<Record<string, unknown>>;
  readonly target: {
    readonly type: string;
    readonly reference?: {
      readonly type: string;
      readonly id: string;
    };
  };
}

export interface ScheduleList {
  readonly data: readonly ScheduleListItem[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

export interface ScheduleDetail {
  readonly data: ScheduleListItem;
}

export interface OccurrenceList {
  readonly data: readonly ScheduleOccurrence[];
  readonly meta: {
    readonly nextPageToken?: string;
  };
}
