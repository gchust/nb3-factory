/** What the tickets list passes to the create dialog and the detail drawer through its `Outlet`. */
export interface TicketsOutletContext {
  /** Refreshes the list behind the overlay without unmounting it. */
  readonly reload: () => void;
}
