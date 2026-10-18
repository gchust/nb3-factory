import { useEffect, type ReactElement } from 'react';

import { useRouteOverlay } from '#components/use-route-overlay';

/**
 * Hands the overlay's `close` to the page that renders the overlay. The page cannot call `useRouteOverlay` itself,
 * because it sits outside the provider; this bridge is rendered inside the overlay body and is the descendant that
 * may use it. Closing after a successful save keeps focus restoration and close guards in one place.
 */
export function OverlayCloseBridge({
  onReady,
}: {
  readonly onReady: (close: () => Promise<void>) => void;
}): ReactElement | null {
  const { close } = useRouteOverlay();
  useEffect(() => {
    onReady(close);
  }, [close, onReady]);
  return null;
}
