import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { defineSchedule } from '@nocobase/app-plugin-scheduler/server';
import {
  schedulerServiceToken,
  type SchedulerService,
} from '@nocobase/app-plugin-scheduler/server/tokens';

import type { ServiceConfig } from '../config/service.js';
import { serviceInspectionServiceToken } from '../service/tokens.js';

const INSPECTION_TARGET = 'service-inspection-plans';
const OVERDUE_TARGET = 'service-order-overdue-reminders';

/**
 * Turns the two service routines into scheduler targets: a daily plan
 * generation and a daily reminder sweep. Both report a terminal outcome
 * synchronously so the scheduler records the run instead of waiting for a
 * worker to report back.
 */
export class ServiceSchedulerProvider extends ServiceProvider<Application> {
  name = 'service/scheduler';

  register(): void {
    const container = this.app.container;
    // A composition without the scheduler plugin or the inspection service has
    // no scheduled routines to register; skip rather than fail the boot.
    if (
      !container.has(schedulerServiceToken) ||
      !container.has(serviceInspectionServiceToken)
    ) {
      return;
    }
    const scheduler = container.resolve<SchedulerService>(
      schedulerServiceToken,
    );
    const inspections = container.resolve(serviceInspectionServiceToken);
    const config =
      this.app.config.get<ServiceConfig>('service') ?? defaultServiceConfig();

    scheduler.registerTarget({
      type: INSPECTION_TARGET,
      title: 'Generate daily device inspection plans',
      validate: () => ({ valid: true }),
      start: async () => {
        const result = await inspections.generateDailyPlans();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { created: result.created, skipped: result.skipped },
        };
      },
    });

    scheduler.registerTarget({
      type: OVERDUE_TARGET,
      title: 'Remind about overdue service orders',
      validate: () => ({ valid: true }),
      start: async () => {
        const result = await inspections.sendOverdueReminders();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { reminders: result.reminders },
        };
      },
    });

    if (config.inspectionSchedule.enabled) {
      scheduler.defineSchedule(
        defineSchedule({
          key: 'service.inspection-plans',
          title: '服务设备巡检计划 / Device inspection plans',
          description:
            '每天为到达下次巡检日期的启用设备生成巡检计划，并通知负责工程师；重复运行不会重复建单。',
          schedule: {
            cron: config.inspectionSchedule.cron,
            timezone: config.inspectionSchedule.timezone,
          },
          target: { type: INSPECTION_TARGET, config: {} },
        }),
      );
    }

    if (config.overdueSchedule.enabled) {
      scheduler.defineSchedule(
        defineSchedule({
          key: 'service.order-overdue-reminders',
          title: '工单超期提醒 / Overdue service order reminders',
          description:
            '每天提醒负责人和主管处理已超过截止时间且未关闭的工单；同一天重复运行只发送一次。',
          schedule: {
            cron: config.overdueSchedule.cron,
            timezone: config.overdueSchedule.timezone,
          },
          target: { type: OVERDUE_TARGET, config: {} },
        }),
      );
    }
  }
}

function defaultServiceConfig(): ServiceConfig {
  return {
    demoData: process.env.NODE_ENV !== 'production',
    inspectionSchedule: {
      enabled: true,
      cron: '0 8 * * *',
      timezone: 'Asia/Shanghai',
    },
    overdueSchedule: {
      enabled: true,
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
    },
    attachment: {
      disk: 'local',
      maxBytes: 25 * 1024 * 1024,
      allowedExtensions: ['png', 'docx'],
    },
    demoPassword: 'Service@2026',
  };
}
