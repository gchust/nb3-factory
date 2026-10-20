import { databaseManagerToken, type Repository } from '@nocobase/db';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { ScheduleTargetStartResult } from '@nocobase/app-plugin-scheduler/server';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

/**
 * The persisted shape of a todo. Dates are `Date`s on the way out of the repository; everything the application
 * exposes converts them to ISO strings at the service boundary.
 */
export interface TodoRecord extends Record<string, unknown> {
  id: string;
  title: string;
  dueAt: Date | string;
  completed: boolean;
  expired: boolean;
  reference: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type TodoCreate = TodoRecord;
export type TodoUpdate = Partial<TodoRecord>;

export interface TodoView {
  id: string;
  title: string;
  dueAt: string;
  completed: boolean;
  expired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListTodosOptions {
  page: number;
  pageSize: number;
}

export interface TodoPage {
  items: TodoView[];
  total: number;
}

export interface CreateTodoInput {
  title: string;
  dueAt: string;
}

export interface UpdateTodoInput {
  title?: string;
  dueAt?: string;
  completed?: boolean;
}

export interface TodoService {
  list(options: ListTodosOptions): Promise<TodoPage>;
  get(id: string): Promise<TodoView | undefined>;
  create(input: CreateTodoInput): Promise<TodoView>;
  update(id: string, input: UpdateTodoInput): Promise<TodoView | undefined>;
  remove(id: string): Promise<boolean>;
  /**
   * Marks every open todo whose due time has passed as expired, and returns how many rows changed.
   *
   * This is the whole scheduled operation. It is intentionally idempotent: the filter only matches rows that are
   * still open (`completed` and `expired` both false) and already due, so a second run in the same minute, or a run
   * that overlaps a previous one, updates nothing and creates nothing. Future-dated rows and completed rows never
   * match.
   */
  markExpired(now?: Date): Promise<{ updated: number }>;
}

export const todosServiceToken =
  createServiceToken<TodoService>('app/todos-service');

/** Target type the "check expired todos" schedule points at. */
export const TODOS_MARK_EXPIRED_TARGET = 'app.todos.markExpired';

/** Stable key of the schedule the application registers on every install. */
export const TODOS_CHECK_EXPIRED_SCHEDULE = 'todos.checkExpired';

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toView(record: TodoRecord): TodoView {
  return {
    id: record.id,
    title: record.title,
    dueAt: toIso(record.dueAt),
    completed: record.completed,
    expired: record.expired,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  };
}

export interface TodoServiceDependencies {
  repository: Repository<TodoRecord, TodoCreate, TodoUpdate>;
  generateId: () => string;
}

export function createTodoService(
  dependencies: TodoServiceDependencies,
): TodoService {
  const { repository, generateId } = dependencies;

  return {
    async list({ page, pageSize }) {
      const [records, total] = await Promise.all([
        repository.findMany({
          sort: (sort) => [
            sort.field('dueAt').asc(),
            sort.field('createdAt').asc(),
          ],
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        repository.count(),
      ]);
      return { items: records.map(toView), total };
    },

    async get(id) {
      const record = await repository.findOne({ filter: { id } });
      return record ? toView(record) : undefined;
    },

    async create(input) {
      const now = new Date();
      const created = await repository.createOne({
        values: {
          id: generateId(),
          title: input.title,
          dueAt: input.dueAt,
          completed: false,
          expired: false,
          reference: null,
          createdAt: now,
          updatedAt: now,
        },
      });
      return toView(created.record);
    },

    async update(id, input) {
      const existing = await repository.findOne({ filter: { id } });
      if (!existing) {
        return undefined;
      }
      const updated = await repository.updateOne({
        filter: { id },
        values: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
          ...(input.completed === undefined
            ? {}
            : { completed: input.completed }),
          updatedAt: new Date(),
        },
      });
      return toView(updated.record);
    },

    async remove(id) {
      const result = await repository.deleteMany({ filter: { id } });
      return result.deletedCount > 0;
    },

    async markExpired(now = new Date()) {
      const result = await repository.updateMany({
        filter: (filter) =>
          filter.and([
            filter.boolean('completed').isFalse(),
            filter.boolean('expired').isFalse(),
            filter.date('dueAt').before(now),
          ]),
        values: { expired: true, updatedAt: new Date() },
      });
      return { updated: result.updatedCount };
    },
  };
}

export default class TodosProvider extends ServiceProvider<Application> {
  public readonly name = 'app/todos-provider';

  public override register(): void {
    this.app.container.singleton(todosServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const ids = this.app.container.resolve(idGeneratorToken);
      return createTodoService({
        repository: database.repository<TodoRecord, TodoCreate, TodoUpdate>(
          'todos',
        ),
        generateId: () => ids.generateString(),
      });
    });
  }

  /**
   * Registers the target the schedule points at and declares the schedule itself.
   *
   * Both happen in `boot()`: every provider's `register()` runs before any provider's `boot()`, so the scheduler
   * service token is bound by the time this runs, and the scheduler's own `start()` (which reconciles registered
   * definitions into the database) runs after every `boot()`.
   */
  public override async boot(): Promise<void> {
    // A runtime composed without the Scheduler plugin still boots the application; there is simply no schedule to
    // declare. The application's own runtime always registers the plugin, so this only covers isolated runtimes.
    if (!this.app.container.has(schedulerServiceToken)) {
      return;
    }
    const scheduler = this.app.container.resolve(schedulerServiceToken);

    scheduler.registerTarget({
      type: TODOS_MARK_EXPIRED_TARGET,
      title: 'Check expired todos',
      validate: () => ({ valid: true }),
      describe: async () => ({
        targetLabel: 'Check expired todos',
        description:
          'Marks every open todo whose due time has passed as expired. Completed and future-dated todos are left alone.',
        href: '/todos',
        state: 'ready',
      }),
      start: async (): Promise<ScheduleTargetStartResult> => {
        const todos = this.app.container.resolve(todosServiceToken);
        const { updated } = await todos.markExpired();
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { updated },
        };
      },
    });

    scheduler.defineSchedule({
      key: TODOS_CHECK_EXPIRED_SCHEDULE,
      title: 'Check expired todos',
      description:
        'Marks every open todo whose due time has passed as expired. Completed and future-dated todos are left alone.',
      // A short cycle on purpose: the application is verified by watching one real run happen. The timezone is the
      // business timezone, so the minute boundaries line up with how the due times are read.
      schedule: { cron: '* * * * *', timezone: 'Asia/Shanghai' },
      target: { type: TODOS_MARK_EXPIRED_TARGET, config: {} },
    });
  }
}
