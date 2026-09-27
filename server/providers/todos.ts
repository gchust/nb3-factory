import type { Application } from '@nocobase/app-server/application';
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
import type {
  ScheduleDefinition,
  ScheduleTargetStartResult,
  ScheduleTargetType,
  TargetValidationResult,
} from '@nocobase/app-plugin-scheduler/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';

/** Stable identity of the scheduled task and the target it points at. */
export const CHECK_OVERDUE_TODOS_SCHEDULE_KEY = 'todos.check-overdue';
export const CHECK_OVERDUE_TODOS_TARGET_TYPE = 'app.check-overdue-todos';

/** The title the Scheduler management UI shows for this plan. */
export const CHECK_OVERDUE_TODOS_TITLE = '检查过期待办';

const TODO_COLLECTION = 'todos';

/**
 * A row of the `todos` collection as the Repository returns it. `dueAt` is a
 * `datetimeTz`, so the portable value is an ISO-8601 instant.
 */
export interface TodoRecord {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

export interface TodoCreateInput {
  readonly title: string;
  /** An ISO-8601 instant; the column is `datetimeTz`. */
  readonly dueAt: string;
}

export interface TodoService {
  list(): Promise<TodoRecord[]>;
  create(input: TodoCreateInput): Promise<TodoRecord>;
  setCompleted(id: number, completed: boolean): Promise<TodoRecord | undefined>;
  /**
   * Marks every todo whose deadline has passed and that is not completed as
   * expired, and returns how many rows changed. Already-expired rows are
   * excluded, so a repeat run is a no-op and the migration never double-counts.
   */
  expireOverdue(now?: Date): Promise<number>;
}

export const todoServiceToken: ServiceToken<TodoService> =
  createServiceToken<TodoService>('app/todos');

/** Raised when a create would reuse an existing title. */
export class TodoTitleConflictError extends Error {
  readonly code = 'TODO_TITLE_CONFLICT';

  constructor(readonly title: string) {
    super(`A todo titled "${title}" already exists.`);
    this.name = 'TodoTitleConflictError';
  }
}

class TodoServiceImpl implements TodoService {
  constructor(private readonly database: DatabaseManager) {}

  private repository(): Repository<TodoRecord> {
    return this.database.repository<TodoRecord>(TODO_COLLECTION);
  }

  async list(): Promise<TodoRecord[]> {
    return this.repository().findMany({
      sort: (sort) => sort.field('dueAt').asc(),
    });
  }

  async create(input: TodoCreateInput): Promise<TodoRecord> {
    const repository = this.repository();
    const existing = await repository.findOne({
      filter: { title: input.title },
    });
    if (existing) throw new TodoTitleConflictError(input.title);

    const { record } = await repository.createOne({
      values: {
        title: input.title,
        dueAt: input.dueAt,
        completed: false,
        expired: false,
      },
    });
    return record;
  }

  async setCompleted(
    id: number,
    completed: boolean,
  ): Promise<TodoRecord | undefined> {
    const repository = this.repository();
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) return undefined;

    const { record } = await repository.updateOne({
      filter: { id },
      values: { completed },
    });
    return record;
  }

  async expireOverdue(now: Date = new Date()): Promise<number> {
    const { updatedCount } = await this.repository().updateMany({
      filter: (filter) =>
        filter.and([
          filter.date('dueAt').before(now),
          filter.boolean('completed').isFalse(),
          filter.boolean('expired').isFalse(),
        ]),
      values: { expired: true },
    });
    return updatedCount;
  }
}

/** Binds the todo service to a database manager; also the seam tests build it through. */
export function createTodoService(database: DatabaseManager): TodoService {
  return new TodoServiceImpl(database);
}

/**
 * Binds the todo service and registers the overdue scan with the Scheduler
 * plugin. The target finishes synchronously, so it reports a terminal
 * `succeeded` outcome and needs no `inspect` observer: `start` itself is the
 * record of the run.
 */
export class TodoProvider extends ServiceProvider<Application> {
  readonly name = 'app/todos';

  register(): void {
    this.app.container.singleton(todoServiceToken, (container) =>
      createTodoService(container.resolve(databaseManagerToken)),
    );
  }

  async boot(): Promise<void> {
    const { container } = this.app;
    // The Scheduler plugin is optional; without it the service still serves the
    // todos page, there is simply nothing to run the scan.
    if (!container.has(schedulerServiceToken)) return;

    const scheduler = container.resolve(schedulerServiceToken);
    const todos = container.resolve(todoServiceToken);

    const target: ScheduleTargetType = {
      type: CHECK_OVERDUE_TODOS_TARGET_TYPE,
      title: CHECK_OVERDUE_TODOS_TITLE,
      validate(): TargetValidationResult {
        // The task takes no configuration, so every shape it can be handed is
        // acceptable; the schedule always supplies `{}`.
        return { valid: true };
      },
      async start(): Promise<ScheduleTargetStartResult> {
        const expired = await todos.expireOverdue(new Date());
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { expired },
        };
      },
    };
    scheduler.registerTarget(target);

    const schedule: ScheduleDefinition = {
      key: CHECK_OVERDUE_TODOS_SCHEDULE_KEY,
      title: CHECK_OVERDUE_TODOS_TITLE,
      description: '将到期时间已过且未完成的待办标记为过期。',
      // A deliberately short period, so the automation can be observed in the
      // Scheduler UI within a minute of starting the application.
      schedule: { cron: '*/1 * * * *', timezone: 'UTC' },
      target: { type: CHECK_OVERDUE_TODOS_TARGET_TYPE, config: {} },
    };
    scheduler.defineSchedule(schedule);
  }
}

export default TodoProvider;
