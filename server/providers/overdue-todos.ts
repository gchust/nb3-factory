import type { Application } from '@nocobase/app-server/application';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The persisted shape of one `todos` row, as the Repository returns it. */
export interface TodoRecord {
  readonly id: number;
  readonly title: string;
  readonly dueAt: Date | string;
  readonly completed: boolean;
  readonly overdue: boolean;
  readonly createdAt: Date | string;
}

export interface OverdueCheckResult {
  /** Rows flipped from open to overdue by this run. */
  readonly markedCount: number;
  readonly checkedAt: Date;
}

export interface OverdueTodoService {
  /**
   * Marks every open todo whose deadline has passed as overdue. Completed
   * todos and todos still in the future are left alone, and because the filter
   * requires `overdue = false` a second run marks nothing.
   */
  checkOverdue(now?: Date): Promise<OverdueCheckResult>;
}

export const overdueTodoServiceToken: ServiceToken<OverdueTodoService> =
  createServiceToken<OverdueTodoService>('app/overdue-todo-service');

export function createOverdueTodoService(
  database: DatabaseManager,
): OverdueTodoService {
  return {
    async checkOverdue(now = new Date()): Promise<OverdueCheckResult> {
      const result = await database.repository<TodoRecord>('todos').updateMany({
        filter: (filter) =>
          filter.and([
            filter.boolean('completed').isFalse(),
            filter.boolean('overdue').isFalse(),
            filter.date('dueAt').before(now),
          ]),
        values: { overdue: true },
      });

      return { checkedAt: now, markedCount: result.updatedCount };
    },
  };
}

/**
 * Owns the overdue-todo domain logic, its Scheduler target, and the schedule
 * that drives it. The target and the definition are registered in `boot()`:
 * every provider has registered its services by then, and Scheduler has not yet
 * synchronized its manifest in `start()`.
 */
export default class OverdueTodoProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/overdue-todo-provider';

  public override register(): void {
    this.app.container.singleton(overdueTodoServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createOverdueTodoService(database);
    });
  }

  public override async boot(): Promise<void> {
    if (!this.app.container.has(schedulerServiceToken)) {
      return;
    }

    const scheduler = this.app.container.resolve(schedulerServiceToken);
    const service = this.app.container.resolve(overdueTodoServiceToken);

    scheduler.registerTarget({
      type: 'app.overdue-todos',
      title: 'Overdue todo check / 检查过期待办',
      validate(config) {
        return config !== null &&
          typeof config === 'object' &&
          !Array.isArray(config)
          ? { valid: true }
          : { valid: false, reason: 'config-must-be-an-object' };
      },
      async start() {
        const result = await service.checkOverdue();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { markedCount: result.markedCount },
        };
      },
    });

    scheduler.defineSchedule({
      // Stable identity: renaming it creates a new schedule rather than moving
      // this one, so the key is namespaced by business area.
      key: 'todo.overdue-check',
      title: 'Check overdue todos / 检查过期待办',
      description:
        'Marks open todos whose deadline has passed as overdue. / 将已过截止时间且未完成的待办标记为已过期。',
      schedule: {
        // A ten-second cycle is deliberately short so one real execution can be
        // observed during verification; a business scan would run far less often.
        cron: '*/10 * * * * *',
        timezone: 'UTC',
      },
      target: {
        type: 'app.overdue-todos',
        config: {},
      },
    });
  }
}
