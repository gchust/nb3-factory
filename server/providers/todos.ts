import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * A row of the `todos` collection created by `202610070001_create_todos`. Field names are the Collection's logical
 * names, so they are the same camelCase names the migration declared.
 */
export interface TodoRecord {
  readonly id: number;
  readonly title: string;
  readonly dueAt: Date | string;
  readonly completed: boolean;
  readonly overdue: boolean;
}

export interface TodoListPage {
  readonly records: readonly TodoRecord[];
  readonly total: number;
}

/** Domain logic for todos, kept out of HTTP so the overdue rule is testable without a server. */
export interface TodoService {
  listPage(input: { page: number; pageSize: number }): Promise<TodoListPage>;

  /**
   * Marks every past-due, still-open, not-yet-marked todo as overdue and returns how many rows changed. It only ever
   * sets `overdue` on rows that were already there — it creates nothing — so running it again (or twice in the same
   * firing) changes no row and duplicates nothing. A completed todo is left alone even when its `dueAt` has passed.
   */
  checkOverdue(now?: Date): Promise<number>;
}

export const todoServiceToken: ServiceToken<TodoService> =
  createServiceToken<TodoService>('app.todos');

export function createTodoService(database: DatabaseManager): TodoService {
  const todos = database.repository<TodoRecord>('todos');

  return {
    async listPage({ page, pageSize }) {
      const [records, total] = await Promise.all([
        todos.findMany({
          sort: (sort) => sort.field('dueAt').asc(),
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        todos.count({}),
      ]);
      return { records, total };
    },

    async checkOverdue(now = new Date()) {
      const { updatedCount } = await todos.updateMany({
        filter: (filter) =>
          filter.and([
            filter.boolean('completed').isFalse(),
            filter.boolean('overdue').isFalse(),
            filter.date('dueAt').before(now),
          ]),
        values: { overdue: true },
      });
      return updatedCount;
    },
  };
}

/**
 * Binds the todo service to its token. The database manager is resolved inside the singleton factory rather than in
 * `register()`, because boot order is what guarantees the connection exists by the time anything asks for the service.
 */
export default class TodoProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/todos';

  public override register(): void {
    this.app.container.singleton(todoServiceToken, (resolver) =>
      createTodoService(resolver.resolve(databaseManagerToken)),
    );
  }
}
