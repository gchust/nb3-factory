/** A row of the `todos` collection, as the todos endpoint returns it. */
export interface Todo {
  readonly id: number;
  readonly title: string;
  /** An ISO-8601 instant. */
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}
