import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/** The stable target type and schedule key this application owns. */
export const CHECK_OVERDUE_TODOS_TARGET = 'app.check-overdue-todos';
export const CHECK_OVERDUE_TODOS_SCHEDULE = 'app.check-overdue-todos';

/**
 * A row of the `todos` Collection. `dueAt` is an RFC 3339 instant because the column is a `datetimeTz`.
 */
export interface TodoRecord {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

/**
 * What a caller supplies when creating a todo; `completed` and `expired` start false. `dueAt` is an RFC 3339
 * instant, the portable temporal value the Repository accepts and returns.
 */
export interface CreateTodoInput {
  readonly title: string;
  readonly dueAt: string;
}

/**
 * Todo reads and writes, and the overdue sweep the schedule runs. Every query goes through the `todos` Collection, so
 * field encoding and dialect differences stay inside the Repository.
 */
export class TodosService {
  public constructor(private readonly database: DatabaseManager) {}

  private repository() {
    return this.database.repository<TodoRecord>('todos');
  }

  public async list(options: {
    limit: number;
    offset: number;
  }): Promise<{ records: readonly TodoRecord[]; total: number }> {
    const repository = this.repository();
    const [records, total] = await Promise.all([
      repository.findMany({
        sort: (sort) => sort.field('dueAt').asc(),
        limit: options.limit,
        offset: options.offset,
      }),
      repository.count(),
    ]);
    return { records, total };
  }

  public async create(input: CreateTodoInput): Promise<TodoRecord> {
    const { record } = await this.repository().createOne({
      values: {
        title: input.title,
        dueAt: input.dueAt,
        completed: false,
        expired: false,
      },
    });
    return record;
  }

  /** Returns the updated todo, or `undefined` when no todo has this id. */
  public async setCompleted(
    todoId: number,
    completed: boolean,
  ): Promise<TodoRecord | undefined> {
    const { updatedCount } = await this.repository().updateMany({
      filter: { id: todoId },
      values: { completed },
    });
    if (updatedCount === 0) return undefined;
    return this.repository().findOne({ filter: { id: todoId } });
  }

  /**
   * Marks every todo whose deadline has passed and which is neither completed nor already expired, and returns how
   * many records that was. The filter is the whole rule, so a second run is a no-op and future or completed todos
   * are never touched.
   */
  public async expireOverdue(now: Date = new Date()): Promise<number> {
    const { updatedCount } = await this.repository().updateMany({
      filter: (filter) =>
        filter.and([
          filter.boolean('completed').isFalse(),
          filter.boolean('expired').isFalse(),
          filter.date('dueAt').notAfter(now),
        ]),
      values: { expired: true },
    });
    return updatedCount;
  }
}

export const todosServiceToken =
  createServiceToken<TodosService>('app/todos-service');

/**
 * Owns the `todos` Service, its overdue target, and the schedule that runs it.
 *
 * The target is short synchronous work — one set-based update — so `start()` completes inline instead of handing it to
 * a job executor. The schedule is registered here, before Scheduler's `start()` reads the manifest, and verified by
 * the application's own scheduler page.
 */
export default class TodosProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name = 'app/todos';

  public override register(): void {
    this.app.container.instance(
      todosServiceToken,
      new TodosService(this.app.container.resolve(databaseManagerToken)),
    );
  }

  public override async boot(): Promise<void> {
    // The Scheduler plugin is registered by the application; `has()` keeps this Provider usable without it.
    if (!this.app.container.has(schedulerServiceToken)) return;
    const scheduler = this.app.container.resolve(schedulerServiceToken);
    const todos = this.app.container.resolve(todosServiceToken);

    scheduler.registerTarget({
      type: CHECK_OVERDUE_TODOS_TARGET,
      title: 'Mark overdue todos as expired',
      validate(config) {
        return config !== null &&
          typeof config === 'object' &&
          !Array.isArray(config) &&
          Object.keys(config).length === 0
          ? { valid: true }
          : { valid: false, reason: 'config-must-be-empty-object' };
      },
      async start() {
        const expiredCount = await todos.expireOverdue();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { expiredCount },
        };
      },
    });

    scheduler.defineSchedule({
      key: CHECK_OVERDUE_TODOS_SCHEDULE,
      title: 'Check overdue todos',
      description:
        'Marks every incomplete todo whose deadline has passed as expired.',
      // Every minute keeps the verification run short. A production application would use the business interval it
      // actually needs; the rule is idempotent either way.
      schedule: { cron: '* * * * *', timezone: 'UTC' },
      target: { type: CHECK_OVERDUE_TODOS_TARGET, config: {} },
    });
  }
}
