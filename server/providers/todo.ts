import type { Application } from '@nocobase/app-server/application';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** A todo as the API renders it: the numeric primary key and the times are strings. */
export interface TodoView {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: string;
}

/** The table row as the repository returns it. */
interface TodoRecord {
  id: number;
  title: string;
  dueAt: Date | string;
  completed: boolean;
  expired: boolean;
  createdAt: Date | string;
}

export interface TodoService {
  /** Newest first, so a freshly added todo is at the top of the page. */
  list(): Promise<readonly TodoView[]>;
  /** Sets `completed`; a missing id rejects with the repository's `RECORD_NOT_FOUND`. */
  setCompleted(todoId: string, completed: boolean): Promise<TodoView>;
  /**
   * Marks every past-due, not-yet-expired, incomplete todo as expired and returns how many changed.
   *
   * Only rows still `expired: false` are touched, so a second run changes nothing and creates no record: the task is
   * an idempotent state transition, never an insert.
   */
  markExpired(now?: Date): Promise<number>;
}

/**
 * The token is the identity of the service. It is created once here and imported everywhere else; recreating one with
 * the same name would be a different key and fail to resolve.
 */
export const todoServiceToken: ServiceToken<TodoService> =
  createServiceToken<TodoService>('app-todos/todo-service');

/** The registered target type the expiry schedule runs. */
export const TODO_EXPIRY_TARGET = 'app.todo-expiry';

/** The key that identifies the expiry schedule across restarts. */
export const TODO_EXPIRY_SCHEDULE_KEY = 'todos.check-expired';

export default class TodoProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app-todos/todo-provider';

  public override register(): void {
    this.app.container.singleton(todoServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createTodoService(database);
    });
  }

  /**
   * Registers the scheduler target and the schedule. Both must happen before Scheduler reads its manifest in
   * `start()`, and every provider's `boot()` runs first. The plugin may not be installed; skip rather than throw.
   */
  public override async boot(): Promise<void> {
    if (!this.app.container.has(schedulerServiceToken)) return;

    const scheduler = this.app.container.resolve(schedulerServiceToken);
    const todos = this.app.container.resolve(todoServiceToken);

    scheduler.registerTarget({
      type: TODO_EXPIRY_TARGET,
      title: 'Overdue todo marking',
      validate: (config) =>
        config !== null && typeof config === 'object' && !Array.isArray(config)
          ? { valid: true }
          : { valid: false, reason: 'config-must-be-an-object' },
      async start() {
        const expiredCount = await todos.markExpired();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { expiredCount },
        };
      },
    });

    scheduler.defineSchedule({
      key: TODO_EXPIRY_SCHEDULE_KEY,
      title: '检查过期待办',
      description:
        '将已过期且未完成的待办标记为过期；未来到期与已完成的记录不受影响。重复执行不会产生新的待办。',
      // Every minute, so a real firing is observable in development without waiting for a daily window.
      schedule: { cron: '* * * * *', timezone: 'Asia/Shanghai' },
      target: { type: TODO_EXPIRY_TARGET, config: {} },
    });
  }
}

function createTodoService(database: DatabaseManager): TodoService {
  const todos: Repository<TodoRecord> =
    database.repository<TodoRecord>('todos');

  return {
    async list() {
      const records = await todos.findMany({
        sort: (sort) => sort.field('createdAt').desc(),
      });
      return records.map(toView);
    },

    async setCompleted(todoId, completed) {
      const { record } = await todos.updateOne({
        filter: { id: Number(todoId) },
        values: { completed },
      });
      return toView(record);
    },

    async markExpired(now = new Date()) {
      const { updatedCount } = await todos.updateMany({
        filter: (filter) =>
          filter.and([
            filter.boolean('completed').isFalse(),
            filter.boolean('expired').isFalse(),
            filter.date('dueAt').before(now),
          ]),
        values: { expired: true },
      });
      return updatedCount;
    },
  };
}

function toView(record: TodoRecord): TodoView {
  return {
    id: String(record.id),
    title: record.title,
    dueAt: toIsoString(record.dueAt),
    completed: record.completed,
    expired: record.expired,
    createdAt: toIsoString(record.createdAt),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
