import type { Application } from '@nocobase/app-server/application';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';

import { todoServiceToken } from './todos.js';

/**
 * Declares the scheduled sweep the todo page's scheduler view shows: a target that runs the business logic, and a
 * schedule definition that fires it every minute.
 *
 * Nothing here writes the database directly. A firing goes through the Scheduler's own dispatch — the target's
 * `start()` is the only place the sweep is invoked — so the run appears in the schedule's execution history like any
 * other. If Scheduler is not installed the provider does nothing; the todo page keeps working and simply has no
 * schedule to show.
 *
 * The cron is every minute on purpose: this demo exists to show that a scheduled run marks expired todos, and a
 * reviewer has to be able to watch that happen without waiting for a day to pass. A production sweep would run at a
 * time that suits the business.
 */
/** The target type the schedule dispatches to; exported so a test can name the registration it verifies. */
export const TARGET_TYPE = 'app.expire-todos';

/** The schedule's stable key, which survives a title or cron change. */
export const SCHEDULE_KEY = 'todos.expire-due';

export default class ExpireTodosScheduleProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/expire-todos-schedule';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(schedulerServiceToken)) return;

    const scheduler = this.app.container.resolve(schedulerServiceToken);
    const todos = this.app.container.resolve(todoServiceToken);

    scheduler.registerTarget({
      type: TARGET_TYPE,
      title: 'Expire overdue todos',
      // The sweep has no parameters: everything it needs is the current instant. Rejecting any other configuration
      // keeps a stray key in the definition from looking like it changes the behaviour.
      validate(config) {
        return config !== null &&
          typeof config === 'object' &&
          !Array.isArray(config) &&
          Object.keys(config).length === 0
          ? { valid: true }
          : { valid: false, reason: 'config-must-be-an-empty-object' };
      },
      async start() {
        const { expiredCount } = await todos.expireDue();
        return {
          state: 'completed',
          outcome: 'succeeded',
          // The execution history shows this, which is what makes a run verifiable after the fact.
          result: { expiredCount },
        };
      },
    });

    scheduler.defineSchedule({
      key: SCHEDULE_KEY,
      title: '检查过期待办',
      description:
        '将已到期且未完成的待办标记为已过期，不修改未到期或已完成的待办。',
      // Expiry compares instants, so the schedule is pinned to UTC rather than following a server's local zone.
      schedule: { cron: '* * * * *', timezone: 'UTC' },
      target: { type: TARGET_TYPE, config: {} },
    });
  }
}
