export interface Todo {
  readonly id: number;
  readonly title: string;
  readonly notes: string | null;
  readonly completed: boolean;
  readonly createdAt: string;
}

/** The status filter stored in the list URL. `all` means no filter. */
export type TodoStatusFilter = 'all' | 'active' | 'completed';

export function isTodoStatusFilter(
  value: string | null,
): value is TodoStatusFilter {
  return value === 'all' || value === 'active' || value === 'completed';
}

/** What the list page passes to its create and edit child routes through `<Outlet context>`. */
export interface TodosOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}
