import type { Application } from '@nocobase/app-server/application';
import {
  schedulerServiceToken,
  type SchedulerService,
} from '@nocobase/app-plugin-scheduler/server/tokens';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

/** A `todos` row as this application reads and writes it. */
export interface TodoRecord {
  id: number;
  title: string;
  dueAt: string;
  completed: boolean;
  expired: boolean;
}

/** What one expiry sweep changed. */
export interface ExpireTodosResult {
  readonly updatedCount: number;
}

/**
 * The business half of the todo page: it reads the list and performs the one derived write the application owns.
 *
 * It never reads an HTTP request, returns a status code, or decides when it runs. The scheduler invokes `expireOverdue`
 * through the target below; the route invokes `list`. Keeping both here is what lets the expiry rule be tested without
 * an HTTP server or a running scheduler.
 */
export class TodoService {
  constructor(private readonly database: DatabaseManager) {}

  /** Every todo, earliest due time first. */
  async list(): Promise<TodoRecord[]> {
    return this.database.repository<TodoRecord>('todos').findMany({
      sort: (sort) => [sort.field('dueAt').asc(), sort.field('id').asc()],
    });
  }

  /**
   * Marks every todo that is overdue and unfinished as expired and reports how many rows that changed.
   *
   * The filter excludes rows already marked `expired`, so a second sweep over the same data updates nothing: the task
   * adds no records and the six-field schedule that calls it is idempotent by construction.
   */
  async expireOverdue(now: Date = new Date()): Promise<ExpireTodosResult> {
    const { updatedCount } = await this.database
      .repository<TodoRecord>('todos')
      .updateMany({
        filter: (filter) =>
          filter.and([
            filter.boolean('completed').isFalse(),
            filter.boolean('expired').isFalse(),
            filter.date('dueAt').before(now),
          ]),
        values: { expired: true },
      });
    return { updatedCount };
  }
}

/** The token the route and the provider resolve the service through; create it once, here. */
export const todoServiceToken: ServiceToken<TodoService> =
  createServiceToken('app/todos');

/** The `type` the schedule below points at, in the scheduler's target registry. */
export const CHECK_EXPIRED_TODOS_TARGET = 'app.checkExpiredTodos';

/** The stable key the schedule is stored under, so restarts reconcile the same row. */
export const CHECK_EXPIRED_TODOS_SCHEDULE = 'todos.check-expired';

/**
 * Wires the application's todo work into the scheduler.
 *
 * The scheduler ships no pages and no run-now endpoint; a task is a target *it* invokes, on a cron an administrator can
 * see and switch on in the Scheduler UI. So the provider registers the service for the route, then registers the target
 * and the schedule during `boot()` — before the scheduler's `start()` reconciles its manifest and enables the worker.
 */
export class TodoProvider extends ServiceProvider<Application> {
  readonly name = 'app/todo-expiry-schedule';

  override register(): void {
    // The singleton factory defers resolving the database manager until the route first asks for the service.
    this.app.container.singleton(
      todoServiceToken,
      () => new TodoService(this.app.container.resolve(databaseManagerToken)),
    );
  }

  override async boot(): Promise<void> {
    // The scheduler is a registered plugin in this application, but a composed runtime may start without it (tests,
    // an embedded scope with its own plugin list). Skip the optional integration rather than failing that boot; the
    // todo service and route above still work.
    if (!this.app.container.has(schedulerServiceToken)) {
      return;
    }
    const scheduler = this.app.container.resolve<SchedulerService>(
      schedulerServiceToken,
    );

    scheduler.registerTarget({
      type: CHECK_EXPIRED_TODOS_TARGET,
      title: '检查过期待办',
      validate: () => ({ valid: true }),
      start: async () => {
        const service = this.app.container.resolve(todoServiceToken);
        const { updatedCount } = await service.expireOverdue();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { updatedCount },
        };
      },
    });

    scheduler.defineSchedule({
      key: CHECK_EXPIRED_TODOS_SCHEDULE,
      title: '检查过期待办',
      description:
        '将已过截止时间且未完成的待办标记为已过期（不新增记录，重复执行结果一致）',
      // Every 10 seconds so a verification run needs no waiting; six fields, the last one seconds.
      schedule: { cron: '*/10 * * * * *', timezone: 'UTC' },
      target: { type: CHECK_EXPIRED_TODOS_TARGET, config: {} },
    });
  }
}
