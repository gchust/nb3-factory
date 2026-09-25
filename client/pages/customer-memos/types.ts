/** A stored customer memo, in the field names the endpoint returns. */
export interface CustomerMemo {
  readonly id: number;
  readonly customerName: string;
  readonly notes: string | null;
  readonly createdAt: string;
}

/** What the list page passes to its child routes (create dialog, detail drawer) through `<Outlet context>`. */
export interface CustomerMemosOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
  /** Called after the detail drawer deletes the record: refreshes the list, then moves focus to the search box. */
  readonly afterDelete: () => void;
}

/** What the detail drawer passes to the edit dialog through `<Outlet context>`. */
export interface CustomerMemoDetailOutletContext {
  /** Called after a successful save: updates the drawer with the record the endpoint returned and refreshes the list. */
  readonly onSaved: (memo: CustomerMemo) => void;
  /** Called on finding that the record no longer exists: the drawer switches to "not found" and the list refreshes. */
  readonly onNotFound: () => void;
}
