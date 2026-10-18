import { useOutletContext } from 'react-router';

export interface Todo {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

export interface TodosOutletContext {
  /** Refreshes the list without replacing the page with a loading state. */
  readonly reload: () => Promise<boolean>;
}

export function useTodosOutletContext(): TodosOutletContext {
  return useOutletContext<TodosOutletContext>();
}

export type TodoStatus = 'pending' | 'completed' | 'expired';

export function todoStatus(todo: Todo): TodoStatus {
  if (todo.completed) {
    return 'completed';
  }
  return todo.expired ? 'expired' : 'pending';
}

export function formatDueDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatDate(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
  }).format(date);
}

/** The `HH:mm` a time input shows for an instant, in the viewer's timezone. */
export function localTimeValue(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

/**
 * Combines the picked local calendar day with the time input. The API stores an
 * instant; the viewer's timezone is what turns one into the other.
 */
export function combineDateAndTime(date: Date, time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const combined = new Date(date);
  combined.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return combined.toISOString();
}
