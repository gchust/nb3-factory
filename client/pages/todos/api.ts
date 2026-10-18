import type { ApiClient } from '@nocobase/app-client';

import type { Todo } from './types.js';

interface TodoListResponse {
  readonly data: readonly Todo[];
  readonly meta: { readonly total: number };
}

interface TodoResponse {
  readonly data: Todo;
}

/** Reads the todo list. A read never marks anything expired; that write belongs to the scheduled task. */
export async function listTodos(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<readonly Todo[]> {
  const response = await api.request<TodoListResponse>({
    path: '/todos',
    signal,
  });
  return response.data;
}

/** Sets the completion flag through the API, so the change is validated and authorized on the server. */
export async function updateTodo(
  api: ApiClient,
  todoId: string,
  completed: boolean,
): Promise<Todo> {
  const response = await api.request<TodoResponse, { completed: boolean }>({
    path: `/todos/${encodeURIComponent(todoId)}`,
    method: 'PATCH',
    json: { completed },
  });
  return response.data;
}
