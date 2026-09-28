/** A customer memo as the API returns it. */
export interface CustomerMemo {
  readonly id: number;
  readonly name: string;
  readonly note: string | null;
  readonly createdAt: string;
}

/** Writable fields, as the form sends them. */
export interface CustomerMemoInput {
  readonly name: string;
  readonly note: string | null;
}

/** What the list page passes to its child routes (create dialog, detail drawer) through `<Outlet context>`. */
export interface MemosOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
  /** Called after the detail drawer deletes a memo: refresh the list, then move focus to the search box. */
  readonly afterDelete: () => void;
}

/** What the detail drawer passes to the edit dialog through `<Outlet context>`. */
export interface MemoDetailOutletContext {
  /** Called after a successful save: update the drawer with the memo the endpoint returned and refresh the list. */
  readonly onSaved: (memo: CustomerMemo) => void;
  /** Called when the memo no longer exists: the drawer switches to "not found" and the list refreshes. */
  readonly onNotFound: () => void;
}
