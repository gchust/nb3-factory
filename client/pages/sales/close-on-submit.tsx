import type { ReactElement } from 'react';

import { useRouteOverlay } from '@/components/use-route-overlay';

export interface CloseOnSubmitProps {
  /** Runs before the overlay closes, to refresh whatever the overlay changed. */
  readonly onSaved: () => void;
  readonly children: (onSubmitted: () => void) => ReactElement;
}

/**
 * The body of a create or edit dialog. It lives inside the overlay so it can
 * call `useRouteOverlay`, which the page component that returns the overlay
 * must not do: that would resolve the outside overlay's context.
 */
export function CloseOnSubmit({
  onSaved,
  children,
}: CloseOnSubmitProps): ReactElement {
  const { close } = useRouteOverlay();

  return children(() => {
    onSaved();
    void close();
  });
}
