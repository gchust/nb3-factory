import type { Application } from '@nocobase/app-server/application';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/** The `todos` row as it is stored and read back through a Repository. */
export interface TodoRow {
  readonly id: number;
  readonly title: string;
  readonly dueAt: Date | string;
  readonly completed: boolean;
  readonly expired: boolean;
}

/** The `todos` row as this application's API exposes it over JSON. */
export interface TodoView {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

/**
 * The application's todo data access. It owns the business rules and knows nothing about HTTP, so both the routes
 * and the scheduled target call the same code.
 */
export interface TodosService {
  /** Every todo, oldest first. */
  list(): Promise<readonly TodoView[]>;
  /** Sets the completed flag of one todo, returning the updated row or `undefined` when it does not exist. */
  setCompleted(id: number, completed: boolean): Promise<TodoView | undefined>;
  /**
   * Marks every todo whose deadline has passed and that is neither completed nor already expired. Returns how many
   * rows changed. Idempotent: a second run with the same data marks nothing, and it never creates a todo.
   */
  markOverdue(now: Date): Promise<number>;
}

export const todosServiceToken =
  createServiceToken<TodosService>('app/todos-service');

/** A stable identity for the target the schedule points at. */
export const CHECK_OVERDUE_TODOS_TARGET = 'app.check-overdue-todos';
/** A stable identity for the recommended schedule; changing it would create a second schedule. */
export const CHECK_OVERDUE_TODOS_SCHEDULE_KEY = 'todos.check-overdue';

function toView(row: TodoRow): TodoView {
  return {
    id: row.id,
    title: row.title,
    dueAt: new Date(row.dueAt).toISOString(),
    completed: Boolean(row.completed),
    expired: Boolean(row.expired),
  };
}

export function createTodosService(database: DatabaseManager): TodosService {
  const repository = () => database.repository<TodoRow>('todos');

  return {
    async list() {
      const rows = await repository().findMany({
        sort: (sort) => sort.field('id').asc(),
      });
      return rows.map(toView);
    },

    async setCompleted(id, completed) {
      // `updateMany` reports a count instead of throwing on a missing row, so a stale id is a plain `undefined` the
      // route turns into a 404 rather than a repository error becoming a 500.
      const { updatedCount } = await repository().updateMany({
        filter: { id },
        values: { completed },
      });
      if (updatedCount === 0) {
        return undefined;
      }
      const record = await repository().findOne({ filter: { id } });
      return record ? toView(record) : undefined;
    },

    async markOverdue(now) {
      const { updatedCount } = await repository().updateMany({
        filter: (filter) =>
          filter.and([
            filter.date('dueAt').before(now),
            filter.boolean('completed').isFalse(),
            filter.boolean('expired').isFalse(),
          ]),
        values: { expired: true },
      });
      return updatedCount;
    },
  };
}

/**
 * Provides the todo service and, once the scheduler plugin's service exists, the target and the schedule itself. The
 * schedule is defined in source rather than created through the UI, so it is part of the application and survives a
 * redeploy; the scheduler keeps its enabled state and execution history.
 */
export default class TodosProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/todos';

  public override register(): void {
    this.app.container.singleton(todosServiceToken, () =>
      createTodosService(this.app.container.resolve(databaseManagerToken)),
    );
  }

  public override async boot(): Promise<void> {
    // The scheduler is optional: without its plugin the page and the API still work, only the automatic marking
    // stops. Every provider's `register()` has run before any `boot()`, so the service exists by now when it is
    // registered at all.
    if (!this.app.container.has(schedulerServiceToken)) {
      return;
    }

    const todos = this.app.container.resolve(todosServiceToken);
    const scheduler = this.app.container.resolve(schedulerServiceToken);

    scheduler.registerTarget({
      type: CHECK_OVERDUE_TODOS_TARGET,
      title: '检查过期待办',
      validate(config) {
        return config && typeof config === 'object' && !Array.isArray(config)
          ? { valid: true }
          : { valid: false, reason: 'target config must be an object' };
      },
      async start() {
        const marked = await todos.markOverdue(new Date());
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { marked },
        };
      },
    });

    scheduler.defineSchedule({
      key: CHECK_OVERDUE_TODOS_SCHEDULE_KEY,
      title: '检查过期待办',
      description: '将已过截止时间且未完成的待办标记为已过期。',
      // A deliberately short period so one real firing is observable during verification. A production schedule
      // would run far less often; this scaffolding task is about proving the whole path works.
      schedule: { cron: '*/30 * * * * *', timezone: 'Asia/Shanghai' },
      target: { type: CHECK_OVERDUE_TODOS_TARGET, config: {} },
    });
  }
}
