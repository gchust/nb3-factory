import type { ApiClient } from '@nocobase/app-client';

import type { Todo, TodoList } from './types.js';

/** The page shows every todo at once; the API caps a page at 100, which is more than a demo list ever holds. */
const PAGE_SIZE = 100;

export async function fetchTodos(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<TodoList> {
  return api.request<TodoList>({
    path: 'todos',
    query: { page: 1, pageSize: PAGE_SIZE },
    signal,
  });
}

export async function createTodo(
  api: ApiClient,
  input: { readonly title: string; readonly dueAt: string },
): Promise<Todo> {
  const { data } = await api.request<{ data: Todo }, typeof input>({
    path: 'todos',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function setTodoCompleted(
  api: ApiClient,
  id: string,
  completed: boolean,
): Promise<Todo> {
  const { data } = await api.request<{ data: Todo }, { completed: boolean }>({
    path: `todos/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: { completed },
  });
  return data;
}
