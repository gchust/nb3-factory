import type { ApiClient } from '@nocobase/app-client';

export type TodoStatus = 'pending' | 'inProgress' | 'completed';
export type TodoPriority = 'normal' | 'urgent';

export interface TeamTodo {
  id: number;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamTodoStats {
  all: number;
  pending: number;
  inProgress: number;
  completed: number;
}

export interface TeamTodoListResult {
  data: TeamTodo[];
  stats: TeamTodoStats;
}

export interface TeamTodoInput {
  title?: string;
  description?: string | null;
  status?: TodoStatus;
  priority?: TodoPriority;
  dueDate?: string | null;
}

export interface ListTeamTodosOptions {
  search?: string;
  status?: TodoStatus;
}

export async function listTeamTodos(
  api: ApiClient,
  options: ListTeamTodosOptions = {},
): Promise<TeamTodoListResult> {
  return api.request<TeamTodoListResult>({
    path: 'team-todos',
    query: {
      search: options.search?.trim() || undefined,
      status: options.status || undefined,
    },
  });
}

export async function createTeamTodo(
  api: ApiClient,
  input: TeamTodoInput,
): Promise<TeamTodo> {
  const result = await api.request<{ data: TeamTodo }>({
    path: 'team-todos',
    method: 'POST',
    json: input,
  });
  return result.data;
}

export async function updateTeamTodo(
  api: ApiClient,
  id: number,
  input: TeamTodoInput,
): Promise<TeamTodo> {
  const result = await api.request<{ data: TeamTodo }>({
    path: `team-todos/${id}`,
    method: 'PUT',
    json: input,
  });
  return result.data;
}

export async function deleteTeamTodo(
  api: ApiClient,
  id: number,
): Promise<void> {
  await api.request({ path: `team-todos/${id}`, method: 'DELETE' });
}
