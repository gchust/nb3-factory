/** A row of the `todos` collection, as `GET /api/todos` returns it. */
export interface Todo {
  readonly id: number;
  readonly title: string;
  /** ISO 8601 UTC. */
  readonly dueAt: string;
  readonly completed: boolean;
  /** Set by the "检查过期待办" Schedule; not by the page. */
  readonly overdue: boolean;
}

export interface TodoList {
  readonly data: Todo[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}
