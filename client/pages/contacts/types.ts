/** What the contacts list page passes to its child routes through `<Outlet context>`. */
export interface ContactsOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}
