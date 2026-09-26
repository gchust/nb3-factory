import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  RepositoryError,
  type DatabaseManager,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** A to-do as the API returns it. `createdAt` is always an ISO-8601 string, whatever the dialect stored. */
export interface Todo {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: string;
}

/**
 * Raised when a write arrives with a title that is empty once trimmed.
 *
 * A domain error rather than an HTTP one: the service owns the rule, and the route decides that it means `400`.
 */
export class TodoTitleRequiredError extends Error {
  public readonly code = 'TODO_TITLE_REQUIRED';

  constructor() {
    super('A to-do title is required.');
    this.name = 'TodoTitleRequiredError';
  }
}

export interface TodoService {
  /** Every to-do, newest first. */
  list(): Promise<Todo[]>;
  /** Creates a to-do. Rejects with {@link TodoTitleRequiredError} when the title is blank. */
  create(title: string): Promise<Todo>;
  /** Sets the completed flag, or resolves `undefined` when no to-do has that id. */
  setCompleted(id: number, completed: boolean): Promise<Todo | undefined>;
}

export const todoServiceToken: ServiceToken<TodoService> =
  createServiceToken<TodoService>('nb3-factory/todo-service');

interface TodoRow {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: Date | string;
}

interface TodoCreate {
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: Date;
}

interface TodoUpdate {
  readonly completed: boolean;
}

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

/** Builds the to-do service over an explicit database, so it can be tested without an application. */
export function createTodoService(database: DatabaseManager): TodoService {
  const todos = () =>
    database.repository<TodoRow, TodoCreate, TodoUpdate>('todos');

  return {
    async list(): Promise<Todo[]> {
      const rows = await todos().findMany({
        sort: (sort) => sort.field('createdAt').desc(),
      });
      return rows.map(toTodo);
    },

    async create(title: string): Promise<Todo> {
      const normalized = title.trim();
      if (!normalized) {
        throw new TodoTitleRequiredError();
      }
      const { record } = await todos().createOne({
        values: { title: normalized, completed: false, createdAt: new Date() },
      });
      return toTodo(record);
    },

    async setCompleted(
      id: number,
      completed: boolean,
    ): Promise<Todo | undefined> {
      try {
        const { record } = await todos().updateOne({
          filter: { id },
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
  };
}

export class TodoProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/todo-provider';

  public override register(): void {
    this.app.container.singleton(todoServiceToken, (resolver) =>
      createTodoService(resolver.resolve(databaseManagerToken)),
    );
  }
}
