/** The shape of a `todos` record as `GET /api/todos` returns it. */
export interface Todo {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
