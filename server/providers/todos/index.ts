import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { TodosService, todosServiceToken } from './service.js';

export { TodosService, todosServiceToken } from './service.js';
export type {
  CreateTodoInput,
  RefreshOverdueResult,
  TodoRecord,
  UpdateTodoInput,
} from './service.js';

/** Stable identity of the overdue check in the Scheduler manifest. */
export const overdueScheduleKey = 'todos.check-overdue';

/** The target type the schedule below points at. */
export const overdueTargetType = 'app.todos.overdue';

/** Owns the todo service's lifetime; it starts with the application's container. */
export class TodosProvider extends ServiceProvider<Application> {
  readonly name = 'todos';

  register(): void {
    this.app.container.singleton(
      todosServiceToken,
      (resolver) => new TodosService(resolver.resolve(databaseManagerToken)),
    );
  }

  override async boot(): Promise<void> {
    // Scheduler is a registered plugin in this application. The guard keeps the
    // todo module usable on its own if an application ever removes it.
    if (!this.app.container.has(schedulerServiceToken)) {
      return;
    }

    const todos = this.app.container.resolve(todosServiceToken);
    const scheduler = this.app.container.resolve(schedulerServiceToken);

    scheduler.registerTarget({
      type: overdueTargetType,
      title: '检查过期待办',
      validate(config) {
        return config !== null &&
          typeof config === 'object' &&
          !Array.isArray(config) &&
          Object.keys(config).length === 0
          ? { valid: true }
          : { valid: false, reason: 'config-must-be-an-empty-object' };
      },
      async start(_config, _context) {
        // The same domain call the todo list uses, so the scheduled run is real
        // business work rather than a second implementation of the rule.
        const result = await todos.markOverdue();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { updatedCount: result.updatedCount },
        };
      },
    });

    // A short cycle keeps the check observable in this small verification app.
    // The definition is the single source of truth; administrators enable or
    // disable it through the Scheduler UI without changing code.
    scheduler.defineSchedule({
      key: overdueScheduleKey,
      title: '检查过期待办',
      description: '将已过截止时间且未完成的待办标记为已过期。',
      schedule: { cron: '*/10 * * * * *', timezone: 'Asia/Shanghai' },
      target: { type: overdueTargetType, config: {} },
    });
  }
}
