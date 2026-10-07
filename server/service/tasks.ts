/**
 * The scheduled work this application registers.
 *
 * One statement shared by the provider that registers the schedules with the
 * scheduler and the route that lists them on the service operations page, so the
 * page can never describe a task the scheduler does not actually run.
 */

import { RUN_KEYS, SCHEDULE_KEYS, TASK_TYPES } from './constants.js';

export interface TaskDefinition {
  /** Stable key of the run ledger row, `scheduledRuns.taskKey`. */
  readonly key: string;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly scheduleKey: string;
  readonly targetType: string;
  readonly cron: string;
  readonly timezone: string;
}

export const TASK_DEFINITIONS: readonly TaskDefinition[] = [
  {
    key: RUN_KEYS.dailyInspections,
    titleKey: 'service.task.dailyInspections.title',
    descriptionKey: 'service.task.dailyInspections.description',
    scheduleKey: SCHEDULE_KEYS.dailyInspections,
    targetType: TASK_TYPES.dailyInspections,
    cron: '0 7 * * *',
    timezone: 'Asia/Shanghai',
  },
  {
    key: RUN_KEYS.overdueReminders,
    titleKey: 'service.task.overdueReminders.title',
    descriptionKey: 'service.task.overdueReminders.description',
    scheduleKey: SCHEDULE_KEYS.overdueReminders,
    targetType: TASK_TYPES.overdueReminders,
    cron: '0 9 * * *',
    timezone: 'Asia/Shanghai',
  },
];

export function taskDefinition(key: string): TaskDefinition | undefined {
  return TASK_DEFINITIONS.find((definition) => definition.key === key);
}
