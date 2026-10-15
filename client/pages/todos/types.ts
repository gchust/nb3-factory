/** A todo as the application's `/api/todos` endpoints return it. `dueAt` is an RFC 3339 instant. */
export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

export interface TodoList {
  readonly data: Todo[];
  readonly meta: {
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  };
}

/** What the list page passes to the create dialog under its outlet. */
export interface TodosOutletContext {
  readonly reload: () => void;
}
