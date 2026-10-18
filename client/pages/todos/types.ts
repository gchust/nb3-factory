/** A todo as `GET /api/todos` returns it. */
export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: string;
}

export type TodoStatus = 'completed' | 'expired' | 'pending';

/**
 * The status a row shows. Completed wins over expired: a record that was completed before its due date must never
 * read as overdue, even if a later run of the scheduled task would have changed it.
 */
export function todoStatus(todo: Todo): TodoStatus {
  if (todo.completed) return 'completed';
  if (todo.expired) return 'expired';
  return 'pending';
}
