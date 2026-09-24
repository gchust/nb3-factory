import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { RepositoryRecord } from '@nocobase/db';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/** A row of the `todos` table as the API and the page read it. */
export interface TodoRecord extends RepositoryRecord {
  readonly id: number;
  readonly title: string;
  readonly dueAt: Date | string;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

export interface CreateTodoInput {
  readonly title: string;
  readonly dueAt: Date;
}

export interface MarkExpiredResult {
  /** How many records this run flipped to expired. */
  readonly marked: number;
}

/**
 * The feature's domain logic. It knows the todo table and the expiry rule, and
 * knows nothing about HTTP or about the scheduler: the route calls it for the
 * page, and the scheduler target calls the same `markExpired` for the plan.
 */
export class TodoService {
  public constructor(private readonly db: DatabaseManager) {}

  /** Most urgent first; the page renders the rows in this order. */
  public async list(): Promise<readonly TodoRecord[]> {
    return this.db
      .repository<TodoRecord>('todos')
      .findMany({ sort: (sort) => sort.field('dueAt').asc() });
  }

  public async create(input: CreateTodoInput): Promise<TodoRecord> {
    const now = new Date();
    const { record } = await this.db.repository<TodoRecord>('todos').createOne({
      values: {
        title: input.title,
        dueAt: input.dueAt,
        completed: false,
        expired: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    return record;
  }

  public async setCompleted(
    id: number,
    completed: boolean,
  ): Promise<TodoRecord> {
    const { record } = await this.db.repository<TodoRecord>('todos').updateOne({
      filter: { id },
      values: { completed, updatedAt: new Date() },
    });
    return record;
  }

  /**
   * The scheduled task's whole effect: any record whose deadline has passed and
   * which is not completed becomes expired. It only flips a flag, so running it
   * again reports zero and leaves every record untouched — repeated execution
   * cannot create a duplicate, and a future or completed record is never
   * selected.
   */
  public async markExpired(now: Date = new Date()): Promise<MarkExpiredResult> {
    const { updatedCount } = await this.db
      .repository<TodoRecord>('todos')
      .updateMany({
        filter: (filter) =>
          filter.and([
            filter.boolean('completed').isFalse(),
            filter.boolean('expired').isFalse(),
            filter.date('dueAt').before(now),
          ]),
        values: { expired: true, updatedAt: now },
      });
    return { marked: updatedCount };
  }
}

export const todoServiceToken = createServiceToken<TodoService>('app.todo');

export const TODO_EXPIRY_TARGET_TYPE = 'app.todo-expiry';

/** The stable identity of the plan an administrator sees in Scheduler. */
export const TODO_EXPIRY_SCHEDULE_KEY = 'app.todo-expiry';

export class TodoProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name = 'app/todo';

  public override register(): void {
    // A lazy singleton: `databaseManagerToken` is resolved on first use rather
    // than during registration, so this provider does not depend on the
    // DatabaseProvider having registered before it.
    this.app.container.singleton(
      todoServiceToken,
      (resolver) => new TodoService(resolver.resolve(databaseManagerToken)),
    );
  }

  public override async boot(): Promise<void> {
    if (!this.app.container.has(schedulerServiceToken)) return;

    const app = this.app;
    const scheduler = app.container.resolve(schedulerServiceToken);

    // The plan the administrator manages in Settings → Scheduled tasks. The
    // title is the business name shown in the list; the short cron drives a
    // real execution within a minute of starting the application.
    scheduler.registerTarget({
      type: TODO_EXPIRY_TARGET_TYPE,
      title: '检查过期待办',
      validate(config) {
        return config !== null &&
          typeof config === 'object' &&
          !Array.isArray(config)
          ? { valid: true }
          : { valid: false, reason: 'config-must-be-an-object' };
      },
      async start() {
        const { marked } = await app.container
          .resolve(todoServiceToken)
          .markExpired();
        // A result summary, not the whole table: Scheduler stores this in the
        // execution record.
        return { state: 'completed', outcome: 'succeeded', result: { marked } };
      },
    });

    scheduler.defineSchedule({
      key: TODO_EXPIRY_SCHEDULE_KEY,
      title: '检查过期待办',
      description:
        '把已过截止时间且未完成的待办标记为已过期，不修改未来或已完成的记录。',
      schedule: { cron: '* * * * *', timezone: 'UTC' },
      target: { type: TODO_EXPIRY_TARGET_TYPE, config: {} },
    });
  }
}

export default TodoProvider;
