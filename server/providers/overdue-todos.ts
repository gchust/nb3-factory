import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';

import { createTodoService, todoServiceToken } from './todos.js';

export const CHECK_OVERDUE_TODOS_SCHEDULE_KEY = 'app.check-overdue-todos';
export const CHECK_OVERDUE_TODOS_TARGET_TYPE = 'app.check-overdue-todos';

/**
 * Binds the todo service and, when the scheduler plugin is part of this application, contributes the visible
 * schedule and the target it points at. The target calls the same service method the rest of the server uses, so a
 * manual validation through the scheduler records a real occurrence instead of writing the table around it.
 */
export default class TodoProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/todos';

  public override register(): void {
    this.app.container.singleton(todoServiceToken, () =>
      createTodoService(this.app.container.resolve(databaseManagerToken)),
    );
  }

  public override async boot(): Promise<void> {
    if (!this.app.container.has(schedulerServiceToken)) return;

    const scheduler = this.app.container.resolve(schedulerServiceToken);
    const todos = this.app.container.resolve(todoServiceToken);

    scheduler.registerTarget({
      type: CHECK_OVERDUE_TODOS_TARGET_TYPE,
      title: 'Check overdue todos',
      validate(config) {
        return config &&
          typeof config === 'object' &&
          !Array.isArray(config) &&
          Object.keys(config).length === 0
          ? { valid: true }
          : { valid: false, reason: 'This task takes no parameters.' };
      },
      async start() {
        const { marked, checkedAt } = await todos.markOverdue();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { marked, checkedAt },
        };
      },
      async describe() {
        return {
          targetLabel: 'Check overdue todos',
          description: 'Marks past-due, incomplete todos as expired.',
          state: 'ready',
        };
      },
    });

    scheduler.defineSchedule({
      key: CHECK_OVERDUE_TODOS_SCHEDULE_KEY,
      title: 'Check overdue todos',
      description:
        'Marks past-due todos as expired without changing completed todos.',
      schedule: {
        // A short cycle keeps the result observable in a development check. It remains an ordinary schedule with
        // its own enabled state and execution history in the Scheduler UI.
        cron: '*/30 * * * * *',
        timezone: 'UTC',
      },
      target: {
        type: CHECK_OVERDUE_TODOS_TARGET_TYPE,
        config: {},
      },
    });
  }
}
