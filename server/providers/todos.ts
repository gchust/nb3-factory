import { randomUUID } from 'node:crypto';

import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  RepositoryError,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** A todo as the HTTP API returns it: instants are ISO 8601 strings, ids are strings. */
export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: string;
}

/** What a todo row holds when it is read; a datetime column may arrive as a `Date` or as its stored string. */
interface TodoRow {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string | Date;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: string | Date;
}

export interface TodoService {
  list(): Promise<Todo[]>;
  create(input: {
    readonly title: string;
    readonly dueAt: string;
  }): Promise<Todo>;
  /** `undefined` when no todo has that id. */
  setCompleted(id: string, completed: boolean): Promise<Todo | undefined>;
  /**
   * Marks every todo that is past due and still open as expired, and returns how many rows it changed. The sweep is
   * idempotent: a second run over the same data changes nothing, so a retried or overlapping firing is harmless.
   */
  expireDue(now?: Date): Promise<{ readonly expiredCount: number }>;
}

export const todoServiceToken: ServiceToken<TodoService> =
  createServiceToken<TodoService>('app/todo-service');

export default class TodoProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/todo-provider';

  public override register(): void {
    this.app.container.singleton(todoServiceToken, () =>
      createTodoService(this.app.container.resolve(databaseManagerToken)),
    );
  }
}

function createTodoService(database: DatabaseManager): TodoService {
  const todos: Repository<TodoRow> = database.repository<TodoRow>('todos');

  return {
    async list() {
      const records = await todos.findMany({
        sort: (sort) => sort.field('dueAt').asc(),
      });
      return records.map(toTodo);
    },

    async create({ title, dueAt }) {
      const { record } = await todos.createOne({
        values: {
          id: randomUUID(),
          title,
          dueAt,
          // A new todo is neither done nor expired. Expiry belongs to the scheduled sweep alone, so a past-due todo
          // created here becomes expired on the next run like any other; the API never writes that flag itself.
          completed: false,
          expired: false,
          createdAt: new Date().toISOString(),
        },
      });
      return toTodo(record);
    },

    async setCompleted(id, completed) {
      try {
        const { record } = await todos.updateOne({
          filter: (filter) => filter.string('id').eq(id),
          values: { completed },
        });
        return toTodo(record);
      } catch (error) {
        if (
          error instanceof RepositoryError &&
          error.code === 'RECORD_NOT_FOUND'
        ) {
          return undefined;
        }
        throw error;
      }
    },

    async expireDue(now = new Date()) {
      // One conditional `UPDATE`, not a read followed by writes: two overlapping firings cannot both claim the same
      // row, because the second one no longer matches `expired = false`. Only the flag changes; no row is created or
      // deleted, so repeated runs can never duplicate a todo.
      const { updatedCount } = await todos.updateMany({
        filter: (filter) =>
          filter.and([
            filter.boolean('completed').isFalse(),
            filter.boolean('expired').isFalse(),
            filter.date('dueAt').before(now),
          ]),
        values: { expired: true },
      });
      return { expiredCount: updatedCount };
    },
  };
}

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    dueAt: toIsoString(row.dueAt),
    completed: row.completed,
    expired: row.expired,
    createdAt: toIsoString(row.createdAt),
  };
}

function toIsoString(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
