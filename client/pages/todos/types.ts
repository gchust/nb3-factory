export interface Todo {
  id: string;
  title: string;
  dueAt: string;
  completed: boolean;
  expired: boolean;
}

export type TodoStatus = 'completed' | 'expired' | 'overdue' | 'pending';

export function todoStatus(todo: Todo, now = Date.now()): TodoStatus {
  if (todo.completed) return 'completed';
  if (todo.expired) return 'expired';
  return new Date(todo.dueAt).getTime() < now ? 'overdue' : 'pending';
}
