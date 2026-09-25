import type {
  JsonObject,
  ScheduleTargetType,
} from '@nocobase/app-plugin-scheduler/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

/** Stable target type and schedule key; both are application-wide identities. */
export const TODO_EXPIRY_TARGET_TYPE = 'app.todos.expire';
export const TODO_EXPIRY_SCHEDULE_KEY = 'todos.check-expired';

export interface TodoRecord {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: string;
}

export interface MarkExpiredResult {
  readonly marked: number;
  readonly checkedAt: string;
}

export interface TodoService {
  list(): Promise<TodoRecord[]>;
  /**
   * Marks every todo that is past due and not completed as expired, and leaves
   * everything else — future-dated or already completed — untouched. Returns
   * how many records this particular run changed, which is what makes repeated
   * execution observably idempotent rather than merely harmless.
   */
  markExpired(now?: Date): Promise<MarkExpiredResult>;
}

export const todoServiceToken = createServiceToken<TodoService>('app.todos');

/**
 * The whole business rule of this feature, independent of HTTP and of the
 * scheduler: a query that touches only past-due, incomplete, not-yet-expired
 * rows and sets one flag. Running it twice changes nothing the second time.
 */
export function createTodoService(database: DatabaseManager): TodoService {
  const todos = database.repository<TodoRecord>('todos');

  return {
    async list() {
      return await todos.findMany({
        sort: (sort) => sort.field('dueAt').asc(),
      });
    },
    async markExpired(now = new Date()) {
      const { updatedCount } = await todos.updateMany({
        filter: (filter) =>
          filter.and([
            filter.date('dueAt').before(now),
            filter.boolean('completed').isFalse(),
            filter.boolean('expired').isFalse(),
          ]),
        values: { expired: true },
      });

      return { marked: updatedCount, checkedAt: now.toISOString() };
    },
  };
}

const TARGET_TITLE = '检查过期待办 / Check expired todos';
const TARGET_DESCRIPTION =
  '过期的未完成待办会被标记为已过期，未来到期的与已完成的保持不变。 / Marks past-due incomplete todos as expired; future-dated and completed todos stay unchanged.';

/**
 * Registers the todo service, the schedule target the scheduler runs, and the
 * schedule itself.
 *
 * Everything here runs in `register()`. The scheduler reads its manifest when
 * `sync()` runs during its own `start()`, so a schedule defined any later would
 * not exist until the next process restart.
 */
export class TodoServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app.todos';

  public override register(): void {
    const container = this.app.container;
    container.singleton(todoServiceToken, () =>
      createTodoService(container.resolve(databaseManagerToken)),
    );

    // The scheduler is a registered plugin, not a hard dependency of this
    // feature: an application assembled without it still serves the todo page
    // and API, and simply defines no schedule. `has` keeps that composition
    // valid instead of failing startup on a missing optional plugin.
    if (!container.has(schedulerServiceToken)) {
      return;
    }

    const scheduler = container.resolve(schedulerServiceToken);

    const target: ScheduleTargetType<JsonObject> = {
      type: TODO_EXPIRY_TARGET_TYPE,
      title: TARGET_TITLE,
      validate(config) {
        return config !== null &&
          typeof config === 'object' &&
          !Array.isArray(config)
          ? { valid: true }
          : { valid: false, reason: 'Target configuration must be an object.' };
      },
      async start() {
        const { marked, checkedAt } = await container
          .resolve(todoServiceToken)
          .markExpired();

        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { marked, checkedAt },
        };
      },
      async describe() {
        return {
          targetLabel: TARGET_TITLE,
          description: TARGET_DESCRIPTION,
          state: 'ready',
        };
      },
    };

    scheduler.registerTarget(target);
    scheduler.defineSchedule({
      key: TODO_EXPIRY_SCHEDULE_KEY,
      title: TARGET_TITLE,
      description: TARGET_DESCRIPTION,
      // Seconds-first six-field cron: every ten seconds, so the verification
      // page can observe a real firing without waiting for a daily window.
      schedule: { cron: '*/10 * * * * *', timezone: 'UTC' },
      target: { type: TODO_EXPIRY_TARGET_TYPE, config: {} },
    });
  }
}
