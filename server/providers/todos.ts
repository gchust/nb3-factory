import { databaseManagerToken, type Repository } from '@nocobase/db';
import type {
  JsonObject,
  ScheduleTargetStartResult,
  ScheduleTargetType,
} from '@nocobase/app-plugin-scheduler/server';
import { defineSchedule } from '@nocobase/app-plugin-scheduler/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/** A todo as the API and the page see it. `title` is the unique business key. */
export interface TodoRecord {
  readonly id: number;
  readonly title: string;
  readonly deadline: string;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: string;
}

export interface CreateTodoInput {
  readonly title: string;
  /** ISO 8601 instant, already validated by the route. */
  readonly deadline: string;
}

export interface TodoService {
  list(): Promise<TodoRecord[]>;
  create(input: CreateTodoInput): Promise<TodoRecord>;
  setCompleted(id: number, completed: boolean): Promise<TodoRecord>;
  /**
   * Marks every incomplete todo whose deadline has passed as expired and
   * returns how many records changed. Idempotent: rows already expired, rows
   * still in the future and completed rows are not touched.
   */
  markExpired(now?: Date): Promise<number>;
}

/** Thrown when a create would collide with the unique `title`. */
export class TodoTitleTakenError extends Error {
  public constructor() {
    super('A todo with that title already exists.');
    this.name = 'TodoTitleTakenError';
  }
}

export class DatabaseTodoService implements TodoService {
  public constructor(private readonly todos: Repository<TodoRecord>) {}

  public async list(): Promise<TodoRecord[]> {
    return this.todos.findMany({
      sort: (sort) => sort.field('deadline').asc(),
    });
  }

  public async create(input: CreateTodoInput): Promise<TodoRecord> {
    const exists = await this.todos.exists({ filter: { title: input.title } });
    if (exists) {
      throw new TodoTitleTakenError();
    }

    const { record } = await this.todos.createOne({
      values: {
        title: input.title,
        deadline: input.deadline,
        completed: false,
        expired: false,
        createdAt: new Date().toISOString(),
      },
    });
    return record;
  }

  public async setCompleted(
    id: number,
    completed: boolean,
  ): Promise<TodoRecord> {
    const { record } = await this.todos.updateOne({
      filter: { id },
      values: { completed },
    });
    return record;
  }

  public async markExpired(now: Date = new Date()): Promise<number> {
    const { updatedCount } = await this.todos.updateMany({
      filter: (filter) =>
        filter.and([
          filter.date('deadline').before(now),
          filter.boolean('completed').isFalse(),
          filter.boolean('expired').isFalse(),
        ]),
      values: { expired: true },
    });
    return updatedCount;
  }
}

export const todoServiceToken =
  createServiceToken<TodoService>('app.todo-service');

/**
 * The scheduled work the application registers with the Scheduler plugin.
 * `检查过期待办` is stored verbatim and shown as the plan's title, so it is
 * deliberately not run through the locale system.
 */
const SCHEDULE_KEY = 'app.todo.check-expired';
const TARGET_TYPE = 'app.todo.expire';
const SCHEDULE_TITLE = '检查过期待办';
const SCHEDULE_DESCRIPTION = '标记已过截止时间且未完成的待办为已过期。';

export function createExpireTarget(todos: TodoService): ScheduleTargetType {
  return {
    type: TARGET_TYPE,
    title: SCHEDULE_TITLE,
    validate: () => ({ valid: true }),
    async start(): Promise<ScheduleTargetStartResult> {
      const expired = await todos.markExpired();
      return { state: 'completed', outcome: 'succeeded', result: { expired } };
    },
    async describe() {
      return {
        targetLabel: SCHEDULE_TITLE,
        description: SCHEDULE_DESCRIPTION,
        state: 'ready',
      };
    },
  };
}

/**
 * Owns the todo service and wires the `检查过期待办` plan into the Scheduler.
 *
 * The plan is defined in `boot()`, before any provider starts, because the
 * scheduler reads its manifest once during its own `start()` and a schedule
 * defined later would not take effect until the next sync.
 */
export class TodoServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/todos';

  public override register(): void {
    const database = this.app.container.resolve(databaseManagerToken);
    this.app.container.singleton(
      todoServiceToken,
      () => new DatabaseTodoService(database.repository<TodoRecord>('todos')),
    );
  }

  public override boot(): Promise<void> {
    const container = this.app.container;

    // The scheduler plugin may be disabled in an application built from this
    // template; in that case there is nothing to register the plan with.
    if (!container.has(schedulerServiceToken)) {
      return Promise.resolve();
    }

    const scheduler = container.resolve(schedulerServiceToken);
    const todos = container.resolve(todoServiceToken);

    scheduler.registerTarget(createExpireTarget(todos));
    scheduler.defineSchedule(
      defineSchedule({
        key: SCHEDULE_KEY,
        title: SCHEDULE_TITLE,
        description: SCHEDULE_DESCRIPTION,
        // A deliberate short cycle: the whole point of this module is to watch
        // one real scheduling run happen end to end. Six fields means seconds.
        schedule: { cron: '*/10 * * * * *', timezone: 'UTC' },
        target: { type: TARGET_TYPE, config: {} satisfies JsonObject },
      }),
    );

    return Promise.resolve();
  }
}
