import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';
import { randomUUID } from 'node:crypto';

import type { Repository } from '@nocobase/db';

const TODO_COLLECTION = 'todo';

interface TodoRow {
  readonly id: string;
  readonly title: string;
  /** The driver returns a string on read; a value just written is still a Date in memory. */
  readonly dueAt: Date | string;
  readonly completed: boolean;
  readonly expired: boolean;
}

/** What the page reads: dates cross the HTTP boundary as RFC 3339 strings. */
export interface TodoView {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

export interface TodoList {
  readonly items: readonly TodoView[];
  readonly total: number;
}

export interface CreateTodoInput {
  readonly title: string;
  readonly dueAt: string;
}

export interface UpdateTodoInput {
  readonly title?: string;
  readonly dueAt?: string;
  readonly completed?: boolean;
}

export interface TodoService {
  list(input: { page: number; pageSize: number }): Promise<TodoList>;
  create(input: CreateTodoInput): Promise<TodoView>;
  update(id: string, input: UpdateTodoInput): Promise<TodoView>;
  remove(id: string): Promise<void>;
  /** Marks every unfinished todo whose due time has passed; returns how many rows changed. */
  markExpired(now: Date): Promise<number>;
}

export const todoServiceToken: ServiceToken<TodoService> =
  createServiceToken<TodoService>('app/todo-service');

function toView(row: TodoRow): TodoView {
  return {
    id: row.id,
    title: row.title,
    dueAt: new Date(row.dueAt).toISOString(),
    completed: row.completed,
    expired: row.expired,
  };
}

function repositoryOf(database: DatabaseManager): Repository<TodoRow> {
  return database.repository<TodoRow>(TODO_COLLECTION);
}

export function createTodoService(database: DatabaseManager): TodoService {
  const repository = repositoryOf(database);

  return {
    async list({ page, pageSize }) {
      const [total, rows] = await Promise.all([
        repository.count(),
        repository.findMany({
          sort: (sort) => [sort.field('dueAt').asc(), sort.field('id').asc()],
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
      ]);
      return { items: rows.map(toView), total };
    },

    async create(input) {
      const row = await repository.createOne({
        values: {
          id: randomUUID(),
          title: input.title,
          dueAt: new Date(input.dueAt),
          completed: false,
          expired: false,
        },
      });
      return toView(row.record);
    },

    async update(id, input) {
      const { record } = await repository.updateOne({
        filter: { id },
        values: {
          ...(input.title === undefined ? {} : { title: input.title }),
          // Moving a todo to a new due time makes the old overdue decision stale.
          ...(input.dueAt === undefined
            ? {}
            : { dueAt: new Date(input.dueAt), expired: false }),
          ...(input.completed === undefined
            ? {}
            : { completed: input.completed }),
        },
      });
      return toView(record);
    },

    async remove(id) {
      await repository.deleteOne({ filter: { id } });
    },

    async markExpired(now) {
      const result = await repository.updateMany({
        filter: (filter) =>
          filter.and([
            filter.boolean('completed').isFalse(),
            filter.boolean('expired').isFalse(),
            filter.date('dueAt').before(now),
          ]),
        values: { expired: true },
      });
      return result.updatedCount;
    },
  };
}

export default class TodoProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = 'app/todo';

  public override register(): void {
    this.app.container.singleton(todoServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createTodoService(database);
    });
  }

  public override async boot(): Promise<void> {
    // Scheduler is an installed plugin in this application, but the provider still states the dependency explicitly.
    if (!this.app.container.has(schedulerServiceToken)) return;
    const scheduler = this.app.container.resolve(schedulerServiceToken);
    const todos = this.app.container.resolve(todoServiceToken);

    scheduler.registerTarget({
      type: 'app.todo.overdue',
      title: 'Mark overdue todos as expired',
      validate(config) {
        return config !== null &&
          typeof config === 'object' &&
          !Array.isArray(config) &&
          Object.keys(config).length === 0
          ? { valid: true }
          : { valid: false, reason: 'todo-overdue-config-must-be-empty' };
      },
      async start() {
        const expiredCount = await todos.markExpired(new Date());
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { expiredCount },
        };
      },
    });

    scheduler.defineSchedule({
      key: 'todos.mark-overdue',
      title: 'Mark overdue todos as expired',
      description:
        'Marks unfinished todos whose due time has passed as expired.',
      schedule: { cron: '*/5 * * * *', timezone: 'UTC' },
      target: { type: 'app.todo.overdue', config: {} },
    });
  }
}
