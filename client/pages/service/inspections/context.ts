/**
 * The value the inspection list hands to its child routes through `<Outlet />`.
 */
export interface InspectionsOutletContext {
  readonly reload: () => void;
}
