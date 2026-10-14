import type { Application } from '@nocobase/app-server/application';
import {
  schedulerServiceToken,
  type SchedulerService,
} from '@nocobase/app-plugin-scheduler/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';

import { todoServiceToken } from './todos.js';

/** The target type a schedule points at; it is an identifier, not a title. */
export const CHECK_OVERDUE_TARGET = 'app.todos.check-overdue';

/**
 * The schedule's stable, application-wide identity. Renaming it would make the Scheduler treat the old row as removed
 * and create a new one, losing the history the management page shows, so it stays fixed.
 */
export const CHECK_OVERDUE_SCHEDULE = 'todos.check-overdue';

/** The plan's name, shown in the Scheduler management page and the occurrence history. */
export const CHECK_OVERDUE_TITLE = '检查过期待办';

/**
 * Registers this application's one scheduled task.
 *
 * There is no separate "run now" entry that writes the flag itself: an immediate run, `pnpm nocobase scheduler sync`
 * and the recurring cron all reach the same target below, and the same occurrence history records them. Running it
 * repeatedly is safe because the target only updates rows that already exist.
 */
export default class TodoSchedulerProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/todos-scheduler';

  public override async boot(): Promise<void> {
    // Scheduler is a registered plugin here, but the guard keeps this provider from failing an application that has
    // been composed without it.
    if (!this.app.container.has(schedulerServiceToken)) {
      return;
    }

    const scheduler: SchedulerService = this.app.container.resolve(
      schedulerServiceToken,
    );
    const todos = this.app.container.resolve(todoServiceToken);

    scheduler.registerTarget({
      type: CHECK_OVERDUE_TARGET,
      title: CHECK_OVERDUE_TITLE,
      // The target takes no input; anything but a JSON object is a misconfiguration the Scheduler reports as invalid.
      validate: (config) =>
        config !== null && typeof config === 'object' && !Array.isArray(config)
          ? { valid: true }
          : { valid: false, reason: 'This target takes no configuration.' },
      start: async () => {
        const updatedCount = await todos.checkOverdue();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { updatedCount },
        };
      },
    });

    scheduler.defineSchedule({
      key: CHECK_OVERDUE_SCHEDULE,
      title: CHECK_OVERDUE_TITLE,
      description: '把已到期且未完成的待办标记为过期。',
      // Every minute is the shortest period that still demonstrates a real, unattended firing without waiting; the
      // task itself is idempotent, so the cadence only decides how fresh the flag is.
      schedule: { cron: '* * * * *', timezone: 'UTC' },
      target: { type: CHECK_OVERDUE_TARGET, config: {} },
    });
  }
}
