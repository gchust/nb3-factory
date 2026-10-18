/** One todo, as `GET /api/todos` returns it. */
export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: string;
}

export interface TodoList {
  readonly data: readonly Todo[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

/** What the page passes to the child routes rendered in its `Outlet`, such as the create dialog. */
export interface TodoOutletContext {
  /** Reloads the list after a write, without remounting the page behind the overlay. */
  readonly reload: () => void;
}
