import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

export interface OverlayCancelButtonProps {
  readonly label: string;
  readonly disabled?: boolean;
}

/** The "Cancel" button in an overlay footer. It closes the overlay it sits in. */
export function OverlayCancelButton({
  label,
  disabled = false,
}: OverlayCancelButtonProps): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button
      type='button'
      variant='outline'
      disabled={disabled || isClosing}
      onClick={() => void close()}
    >
      {label}
    </Button>
  );
}

export interface OverlaySubmitButtonProps {
  readonly formId: string;
  readonly submitting: boolean;
  readonly label: string;
  readonly submittingLabel: string;
}

/**
 * The submit button in an overlay footer. It sits outside the `<form>` and is
 * linked through `form`, so pressing Enter in a field still submits while the
 * button is enabled.
 */
export function OverlaySubmitButton({
  formId,
  submitting,
  label,
  submittingLabel,
}: OverlaySubmitButtonProps): ReactElement {
  return (
    <Button type='submit' form={formId} disabled={submitting}>
      {submitting ? <Spinner data-icon='inline-start' /> : null}
      {submitting ? submittingLabel : label}
    </Button>
  );
}
