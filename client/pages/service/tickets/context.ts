/**
 * The value the ticket list hands to its child routes through `<Outlet />`.
 * Closing an overlay does not remount the list, so a child that changes a
 * ticket must ask the list to reload rather than relying on a remount.
 */
export interface TicketsOutletContext {
  readonly reload: () => void;
}
