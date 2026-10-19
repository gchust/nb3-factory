import type { ApiClient } from '@nocobase/app-client';

export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

export interface TodoList {
  readonly data: readonly Todo[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

export interface TodoChanges {
  readonly title?: string;
  readonly dueAt?: string;
  readonly completed?: boolean;
}

export async function fetchTodos(
  api: ApiClient,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<TodoList> {
  return api.request<TodoList>({
    path: 'todos',
    query: { page, pageSize },
    signal,
  });
}

export async function createTodo(
  api: ApiClient,
  values: { title: string; dueAt: string },
): Promise<Todo> {
  const { data } = await api.request<{ data: Todo }>({
    path: 'todos',
    method: 'POST',
    json: values,
  });
  return data;
}

export async function updateTodo(
  api: ApiClient,
  id: string,
  changes: TodoChanges,
): Promise<Todo> {
  const { data } = await api.request<{ data: Todo }>({
    path: `todos/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: changes,
  });
  return data;
}

export async function deleteTodo(api: ApiClient, id: string): Promise<void> {
  await api.request<void>({
    path: `todos/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}
