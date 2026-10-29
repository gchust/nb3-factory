export type ScheduleStatus = 'active' | 'paused';
export type ScheduleTargetState = 'ready' | 'disabled' | 'missing' | 'invalid';
export type ScheduleLifecycleState = 'active' | 'inactive';

export interface Schedule {
  id: string;
  key: string;
  title: string;
  description?: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  targetType: string;
  lifecycleState: ScheduleLifecycleState;
  inactiveReason?: string;
  runCount: number;
  completedCount: number;
  nextRunAt?: string;
  lastRunAt?: string;
  scheduleStatus: ScheduleStatus;
  targetState: ScheduleTargetState;
  targetSummary: {
    targetLabel: string;
    description?: string;
    href?: string;
    state?: ScheduleTargetState;
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

export interface ScheduleOccurrence {
  id: string;
  scheduleId: string;
  status: OccurrenceStatus;
  reason?: string;
  executionCount: number;
  startedAt: string;
  acceptedAt?: string;
  finishedAt?: string;
  resultSummary?: Record<string, unknown>;
  target: {
    type: string;
    reference?: { type: string; id: string };
    href?: string;
  };
}

export interface SchedulerListResponse {
  data: Schedule[];
  meta: { page: number; pageSize: number; total: number };
}

export interface ScheduleResponse {
  data: Schedule;
}

export interface OccurrenceListResponse {
  data: ScheduleOccurrence[];
  meta: { nextPageToken?: string };
}
