import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  schedulerServiceToken,
  type SchedulerService,
} from '@nocobase/app-plugin-scheduler/server/tokens';
import type { JsonObject } from '@nocobase/app-plugin-scheduler/server';
import { ServiceProvider } from '@nocobase/service-provider';

import { todoServiceToken, type TodoService } from './todos.js';

export const TODO_EXPIRY_TARGET = 'todos.expiry-check';
export const TODO_EXPIRY_SCHEDULE_KEY = 'todos.expiry-check';
/** The client locale namespace: the application's package name, which owns its locale files. */
const APP_I18N_NAMESPACE = 'nb3-factory';

/** The scheduler calls this function every time the stored schedule fires. */
export async function runTodoExpiryCheck(
  service: TodoService,
): Promise<
  | { state: 'completed'; outcome: 'succeeded'; result: JsonObject }
  | { state: 'failed'; reason: string }
> {
  try {
    const result = await service.markExpired();
    return {
      state: 'completed',
      outcome: 'succeeded',
      result: {
        marked: result.marked,
        total: result.total,
        checkedAt: result.checkedAt,
      },
    };
  } catch {
    // The execution history records a stable reason instead of a raw database
    // error, which can contain connection details.
    return { state: 'failed', reason: 'todo-expiry-check-failed' };
  }
}

/**
 * Registers the todo collection with data authorization and contributes the
 * recurring expiry check. The schedule is stored by the scheduler, so an
 * administrator can pause or resume it through the management UI without a
 * restart.
 */
export default class TodoSchedulerProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/todo-scheduler-provider';

  public override async boot(): Promise<void> {
    // Application providers must boot even when a template plugin that owns an
    // optional service is not registered (tests and embedded runtimes build
    // applications without the default plugin set).
    if (this.app.container.has(authorizationToken)) {
      const authorization = this.app.container.resolve(authorizationToken);
      authorization.database.collections.add({
        name: 'todos',
        title: { key: 'todos.collectionTitle', ns: APP_I18N_NAMESPACE },
      });
    }

    if (!this.app.container.has(schedulerServiceToken)) {
      return;
    }

    const scheduler = this.app.container.resolve<SchedulerService>(
      schedulerServiceToken,
    );
    scheduler.registerTarget<JsonObject>({
      type: TODO_EXPIRY_TARGET,
      // Scheduler stores a display string rather than a key; the application UI
      // translates these keys so both languages share one stored definition.
      title: 'todos.schedules.target.title',
      validate: () => ({ valid: true }),
      start: async () => {
        const service = this.app.container.resolve(todoServiceToken);
        return runTodoExpiryCheck(service);
      },
    });
    scheduler.defineSchedule({
      key: TODO_EXPIRY_SCHEDULE_KEY,
      title: 'todos.schedules.definition.title',
      description: 'todos.schedules.definition.description',
      schedule: {
        cron: '*/30 * * * * *',
        timezone: 'Asia/Shanghai',
      },
      target: {
        type: TODO_EXPIRY_TARGET,
        config: {},
      },
    });
  }
}
