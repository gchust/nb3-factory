/** A customer memo as the API returns it. */
export interface CustomerMemo {
  readonly id: number;
  readonly name: string;
  readonly note: string | null;
  readonly createdAt: string;
}

/** What the list page passes to its create and detail child routes through `<Outlet context>`. */
export interface CustomerMemosOutletContext {
  /** Reloads the list in the background. */
  readonly reload: () => void;
}

/** What the detail drawer passes to the edit dialog through `<Outlet context>`. */
export interface CustomerMemoDetailOutletContext {
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSaved: (memo: CustomerMemo) => void;
  /** Called when the record no longer exists: the drawer switches to "not found" and the list refreshes. */
  readonly onNotFound: () => void;
}
