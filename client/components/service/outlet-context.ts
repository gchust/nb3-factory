import { useOutletContext } from 'react-router';

/**
 * What a list page hands to the overlays declared under it.
 *
 * Opening an order is a child route of whichever page the user is on, so the
 * detail drawer can be reached from the order list and from the dashboard. Both
 * pages put a `reload` in their outlet context, and the drawer refreshes the
 * page beneath it after a write so the row it came from shows the new state
 * without a second click.
 *
 * The context is optional: an overlay rendered outside a list simply has
 * nothing to refresh.
 */
export interface ServiceOutletContext {
  readonly reload?: () => void;
}

export function useServiceOutlet(): { readonly reload: () => void } {
  const context = useOutletContext<ServiceOutletContext | null>();
  return { reload: context?.reload ?? (() => {}) };
}
