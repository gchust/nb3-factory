import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface TodoRecord {
  id: string;
  title: string;
  dueAt: Date | string;
  completed: boolean;
  expired: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TodoView {
  id: string;
  title: string;
  dueAt: string;
  completed: boolean;
  expired: boolean;
}

export interface OverdueTodoResult {
  marked: number;
  checkedAt: string;
}

export interface TodoService {
  list(): Promise<TodoView[]>;
  markOverdue(now?: Date): Promise<OverdueTodoResult>;
}

export const todoServiceToken: ServiceToken<TodoService> =
  createServiceToken<TodoService>('app/todo-service');

function isoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/**
 * Scans only the rows the schedule is allowed to change: due before `now`, not completed, and not already expired.
 * The `expired` predicate makes a repeated run a no-op, and leaving `completed` out of the target means a completed
 * todo stays exactly as its owner left it.
 */
export function createTodoService(
  database: Pick<DatabaseManager, 'repository'>,
): TodoService {
  const repository = database.repository<TodoRecord>('todos');

  return {
    async list() {
      const records = await repository.findMany({
        sort: (sort) => sort.field('dueAt').asc(),
      });

      return records.map((record) => ({
        id: record.id,
        title: record.title,
        dueAt: isoString(record.dueAt),
        completed: record.completed,
        expired: record.expired,
      }));
    },

    async markOverdue(now = new Date()) {
      const checkedAt = now.toISOString();
      const result = await repository.updateMany({
        filter: (filter) =>
          filter.and([
            filter.boolean('completed').isFalse(),
            filter.boolean('expired').isFalse(),
            filter.date('dueAt').before(now),
          ]),
        values: {
          expired: true,
          updatedAt: now,
        },
      });

      return { marked: result.updatedCount, checkedAt };
    },
  };
}
