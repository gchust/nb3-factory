import type { Application } from '@nocobase/app-server/application';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { TargetValidationResult } from '@nocobase/app-plugin-scheduler/server';
import { ServiceProvider } from '@nocobase/service-provider';
import { ticketServiceToken } from '../service/ticket-service.js';

/** A target config that accepts only an empty object; both tasks are clock-driven. */
function validateEmptyConfig(config: unknown): TargetValidationResult {
  if (
    config !== null &&
    typeof config === 'object' &&
    !Array.isArray(config) &&
    Object.keys(config).length === 0
  ) {
    return { valid: true };
  }
  return { valid: false, reason: 'config-must-be-an-empty-object' };
}

/**
 * Daily work that must run on wall-clock time in the team's own time zone:
 * generating the day's inspection tasks, and reminding owners about tickets
 * past their due time. Both are idempotent per (entity, date), so a retry or a
 * second firing on the same day changes nothing.
 */
export default class EquipmentSchedulerProvider extends ServiceProvider<Application> {
  public readonly name = 'app/equipment-scheduler';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(schedulerServiceToken)) {
      return;
    }
    const scheduler = this.app.container.resolve(schedulerServiceToken);
    const tickets = () => this.app.container.resolve(ticketServiceToken);

    scheduler.registerTarget({
      type: 'app.service-inspection-generation',
      title: 'Generate daily inspection tasks',
      validate: validateEmptyConfig,
      start: async () => {
        const { created, skipped } = await tickets().generateDailyInspections();
        return {
          state: 'completed',
          outcome: 'succeeded',
          // The full business result, so a manual run and a timed firing record
          // and report the same shape.
          result: { created, skipped },
        };
      },
    });

    scheduler.registerTarget({
      type: 'app.service-overdue-reminders',
      title: 'Send overdue service ticket reminders',
      validate: validateEmptyConfig,
      start: async () => {
        const { created, skipped } = await tickets().sendOverdueReminders();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { created, skipped },
        };
      },
    });

    scheduler.defineSchedule({
      key: 'service.daily-inspections',
      title: 'Daily inspection task generation',
      description:
        'Creates one inspection task per enabled device each morning (Asia/Shanghai).',
      schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
      target: { type: 'app.service-inspection-generation', config: {} },
    });

    scheduler.defineSchedule({
      key: 'service.overdue-reminders',
      title: 'Daily overdue ticket reminders',
      description:
        'Reminds ticket owners about every open ticket past its due time (Asia/Shanghai).',
      schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
      target: { type: 'app.service-overdue-reminders', config: {} },
    });
  }
}
