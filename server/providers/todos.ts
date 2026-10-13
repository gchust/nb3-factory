import type { ScheduleTargetType } from '@nocobase/app-plugin-scheduler/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/** A row of `todoItems` as the application models it. */
export interface TodoItemRecord {
  readonly id: number;
  readonly title: string;
  readonly dueAt: Date;
  readonly completed: boolean;
  readonly overdue: boolean;
}

/** A todo as the HTTP API and the `/todos` page read it. */
export interface TodoView {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly overdue: boolean;
}

export interface TodoListOptions {
  readonly page: number;
  readonly pageSize: number;
}

export interface TodoListResult {
  readonly items: readonly TodoView[];
  readonly total: number;
}

/** What one run of the overdue marking changed. */
export interface OverdueMarkResult {
  readonly marked: number;
}

/**
 * The todo business logic, separated from HTTP and from scheduling. `markOverdue` is the whole rule the scheduled
 * task applies: a past-due, still-open todo becomes overdue; everything else is left alone. It updates in place and
 * never inserts, so running it again changes nothing.
 */
export class TodoService {
  constructor(private readonly database: DatabaseManager) {}

  private repository(): Repository<TodoItemRecord> {
    return this.database.repository<TodoItemRecord>('todoItems');
  }

  async list(options: TodoListOptions): Promise<TodoListResult> {
    const repository = this.repository();
    const [rows, total] = await Promise.all([
      repository.findMany({
        sort: (sort) => sort.field('dueAt').asc(),
        limit: options.pageSize,
        offset: (options.page - 1) * options.pageSize,
      }),
      repository.count(),
    ]);

    return { items: rows.map(toView), total };
  }

  async markOverdue(now: Date = new Date()): Promise<OverdueMarkResult> {
    const result = await this.repository().updateMany({
      filter: (filter) =>
        filter.and([
          filter.boolean('completed').isFalse(),
          filter.boolean('overdue').isFalse(),
          filter.date('dueAt').notAfter(now),
        ]),
      values: { overdue: true },
    });

    return { marked: result.updatedCount };
  }
}

function toView(record: TodoItemRecord): TodoView {
  return {
    id: Number(record.id),
    title: record.title,
    dueAt: new Date(record.dueAt).toISOString(),
    completed: Boolean(record.completed),
    overdue: Boolean(record.overdue),
  };
}

/** Resolves the one `TodoService`, built against the application's default connection. */
export const todoServiceToken =
  createServiceToken<TodoService>('app/todos/service');

/** The registered target type the overdue schedule runs. */
export const TODO_OVERDUE_TARGET = 'app.todo-overdue';

/** The stable, application-wide identity of the overdue schedule. */
export const TODO_OVERDUE_SCHEDULE_KEY = 'todos.mark-overdue';

/**
 * Wires the todo service into the application and, when the Scheduler plugin is present, publishes the target and the
 * schedule an administrator sees in the Scheduler management UI. Both are registered in `boot()`, after the database
 * provider has run migrations and created `todoItems`, and before the Scheduler syncs its manifest in `start()`.
 */
export class TodoProvider extends ServiceProvider<Application> {
  readonly name = 'app.todos';

  register(): void {
    this.app.container.singleton(
      todoServiceToken,
      () => new TodoService(this.app.container.resolve(databaseManagerToken)),
    );
  }

  async boot(): Promise<void> {
    const container = this.app.container;
    if (!container.has(schedulerServiceToken)) {
      return;
    }

    const scheduler = container.resolve(schedulerServiceToken);

    const target: ScheduleTargetType = {
      type: TODO_OVERDUE_TARGET,
      title: 'Mark overdue todos',
      validate(config) {
        return isPlainEmptyObject(config)
          ? { valid: true }
          : {
              valid: false,
              reason: 'This target takes no configuration.',
            };
      },
      async start() {
        const { marked } = await container
          .resolve(todoServiceToken)
          .markOverdue();
        return { state: 'completed', outcome: 'succeeded', result: { marked } };
      },
    };

    scheduler.registerTarget(target);
    scheduler.defineSchedule({
      key: TODO_OVERDUE_SCHEDULE_KEY,
      title: 'Mark overdue todos',
      description:
        'Marks every uncompleted todo whose due time has passed as overdue.',
      schedule: { cron: '* * * * *', timezone: 'UTC' },
      target: { type: TODO_OVERDUE_TARGET, config: {} },
    });
  }
}

function isPlainEmptyObject(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}
