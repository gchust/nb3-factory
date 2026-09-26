import type { Application } from '@nocobase/app-server/application';
import type { DatabaseManager } from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** A to-do as the browser receives it: `createdAt` is always an ISO string. */
export interface Todo {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: string;
}

/** The persisted shape, where `createdAt` may come back as a `Date` or a string. */
interface TodoRecord {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: Date | string;
}

export interface TodoService {
  list(): Promise<Todo[]>;
  create(input: { readonly title: string }): Promise<Todo>;
  /** Returns `undefined` when no to-do has this id. */
  setCompleted(
    id: number,
    input: { readonly completed: boolean },
  ): Promise<Todo | undefined>;
}

export const todoServiceToken: ServiceToken<TodoService> =
  createServiceToken<TodoService>('app/todo-service');

function toTodo(record: TodoRecord): Todo {
  const createdAt =
    record.createdAt instanceof Date
      ? record.createdAt
      : new Date(record.createdAt);
  return {
    id: record.id,
    title: record.title,
    completed: record.completed,
    createdAt: createdAt.toISOString(),
  };
}

/**
 * Builds the service explicitly from its dependency so a test can construct it
 * against a real connection without standing up the provider registry.
 */
export function createTodoService(database: DatabaseManager): TodoService {
  function repository() {
    return database.repository<TodoRecord>('todos');
  }

  return {
    async list() {
      const records = await repository().findMany({
        sort: (sort) => sort.field('createdAt').desc(),
      });
      return records.map(toTodo);
    },

    async create({ title }) {
      const { record } = await repository().createOne({
        values: { title, completed: false, createdAt: new Date() },
      });
      return toTodo(record);
    },

    async setCompleted(id, { completed }) {
      const todos = repository();
      const existing = await todos.findOne({ filter: { id } });
      if (!existing) return undefined;
      const { record } = await todos.updateOne({
        filter: { id },
        values: { completed },
      });
      return toTodo(record);
    },
  };
}

export default class TodoProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/todo-provider';

  public override register(): void {
    this.app.container.singleton(todoServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createTodoService(database);
    });
  }
}
