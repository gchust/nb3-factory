/** What the opportunities list page passes to its child routes through `<Outlet context>`. */
export interface OpportunitiesOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}
