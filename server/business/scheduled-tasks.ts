import type {
  JsonObject,
  ScheduleDefinition,
  ScheduleExecutionContext,
  ScheduleTargetType,
  ScheduleTargetStartResult,
  TargetValidationResult,
} from '@nocobase/app-plugin-scheduler/server';

import {
  readRunToken,
  RUN_TOKEN_KEY,
  type MaintenanceRunRecorder,
} from '../services/maintenance-scheduler.js';
import type { ServiceDesk } from '../services/service-desk.js';

// The two recurring maintenance operations the service desk needs. They are
// this application's own schedules: the scheduler plugin only stores and fires
// them and shows their status, while the business work stays in the service.
export const INSPECTION_GENERATION_TARGET =
  'app.service-desk.inspection-generation';
export const OVERDUE_REMINDER_TARGET = 'app.service-desk.overdue-reminder';

export const INSPECTION_GENERATION_SCHEDULE =
  'app.service-desk.inspections.daily';
export const OVERDUE_REMINDER_SCHEDULE = 'app.service-desk.reminders.daily';

// Every day at 09:00 China Standard Time, so a supervisor sees new inspection
// work at the start of the working day. The reminder runs a few minutes later
// so a newly generated inspection does not race the overdue scan.
const TZ = 'Asia/Shanghai';

function emptyConfig(config: unknown): TargetValidationResult {
  if (config === undefined || config === null) return { valid: true };
  if (typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, reason: 'Configuration must be an object' };
  }
  const keys = Object.keys(config).filter((key) => key !== RUN_TOKEN_KEY);
  if (keys.length > 0) {
    return {
      valid: false,
      reason: `Unknown configuration: ${keys.join(', ')}`,
    };
  }
  return { valid: true };
}

async function runGuarded(operation: () => Promise<JsonObject>): Promise<
  | {
      readonly state: 'completed';
      readonly outcome: 'succeeded';
      readonly result: JsonObject;
    }
  | { readonly state: 'failed'; readonly reason: string }
> {
  try {
    const result = await operation();
    return { state: 'completed', outcome: 'succeeded', result };
  } catch (error) {
    return {
      state: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Wraps a target's business operation so the run's real outcome is reported
 * both to the Scheduler and, when a request triggered this firing, back to the
 * caller through the correlation token in the target configuration.
 */
function guardedStart(
  recorder: MaintenanceRunRecorder,
  targetType: string,
  operation: () => Promise<{ created: number }>,
): (config: JsonObject) => Promise<ScheduleTargetStartResult> {
  return async (config) => {
    const runToken = readRunToken(config);
    const outcome = await runGuarded(async () => {
      const result = await operation();
      return { created: result.created };
    });
    if (outcome.state === 'completed') {
      recorder.record(targetType, runToken, {
        status: 'succeeded',
        created: Number(outcome.result?.created ?? 0),
      });
    } else {
      recorder.record(targetType, runToken, {
        status: 'failed',
        created: 0,
        reason: outcome.reason,
      });
    }
    return outcome;
  };
}

export function createInspectionGenerationTarget(
  getService: () => ServiceDesk,
  recorder: MaintenanceRunRecorder,
): ScheduleTargetType {
  return {
    type: INSPECTION_GENERATION_TARGET,
    title: '生成到期设备巡检任务',
    validate: emptyConfig,
    describe: async () => ({
      targetLabel: '设备巡检生成',
      description:
        '为已启用且到达巡检日期的设备生成当天巡检任务，并为负责人发送提醒。',
      // The scheduler reads `state` from `describe()` output and only defaults
      // it to `ready` when a target has no describe at all; omitting it makes an
      // otherwise available target show as Invalid.
      state: 'ready',
    }),
    start: guardedStart(recorder, INSPECTION_GENERATION_TARGET, async () => {
      const result = await getService().generateDueInspections();
      return { created: result.created };
    }),
  };
}

export function createOverdueReminderTarget(
  getService: () => ServiceDesk,
  recorder: MaintenanceRunRecorder,
): ScheduleTargetType {
  return {
    type: OVERDUE_REMINDER_TARGET,
    title: '逾期工单提醒',
    validate: emptyConfig,
    describe: async () => ({
      targetLabel: '逾期工单提醒',
      description: '为已逾期且尚未完成的工单负责人发送站内提醒，每天最多一次。',
      state: 'ready',
    }),
    start: guardedStart(recorder, OVERDUE_REMINDER_TARGET, async () => {
      const result = await getService().runOverdueReminders(undefined);
      return { created: result.created };
    }),
  };
}

export function createScheduleDefinitions(): readonly ScheduleDefinition[] {
  return [
    {
      key: INSPECTION_GENERATION_SCHEDULE,
      title: '每日设备巡检生成',
      description: '每天 09:00 (CST) 为到期的启用设备生成巡检任务。',
      schedule: { cron: '0 9 * * *', timezone: TZ },
      target: { type: INSPECTION_GENERATION_TARGET, config: {} },
    },
    {
      key: OVERDUE_REMINDER_SCHEDULE,
      title: '每日逾期工单提醒',
      description: '每天 09:05 (CST) 提醒逾期未完成工单的负责人。',
      schedule: { cron: '5 9 * * *', timezone: TZ },
      target: { type: OVERDUE_REMINDER_TARGET, config: {} },
    },
  ];
}

export type { ScheduleExecutionContext };
