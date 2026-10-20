import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface TodoRow {
  readonly id: string;
  readonly title: string;
  readonly dueAt: Date;
  readonly completed: boolean;
  readonly expired: boolean;
}

export interface ExpiryCheckResult {
  /** Rows this run changed from not-expired to expired. */
  readonly marked: number;
  /** Every todo in the table, so a caller can confirm that no record was added. */
  readonly total: number;
  readonly checkedAt: string;
}

export interface TodoService {
  markExpired(now?: Date): Promise<ExpiryCheckResult>;
}

export const todoServiceToken: ServiceToken<TodoService> =
  createServiceToken<TodoService>('app/todo-service');

export function createTodoService(database: DatabaseManager): TodoService {
  return {
    async markExpired(now = new Date()): Promise<ExpiryCheckResult> {
      return database.transaction(async (connection) => {
        const todos = connection.repository<TodoRow>('todos');
        const updated = await todos.updateMany({
          filter: (filter) =>
            filter.and([
              filter.boolean('completed').isFalse(),
              filter.boolean('expired').isFalse(),
              filter.date('dueAt').before(now),
            ]),
          values: { expired: true },
        });
        const total = await todos.count();

        return {
          marked: updated.updatedCount,
          total,
          checkedAt: now.toISOString(),
        };
      });
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
