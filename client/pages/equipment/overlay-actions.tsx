import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

/**
 * The "Cancel" button of an overlay footer. It calls `useRouteOverlay()`, so it must be rendered inside the
 * `RouteDialog` — which the footer is.
 */
export function OverlayCancelButton({
  disabled = false,
}: {
  readonly disabled?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button
      type='button'
      variant='outline'
      disabled={disabled || isClosing}
      onClick={() => void close()}
    >
      {t('actions.cancel')}
    </Button>
  );
}

/**
 * The submit button of an overlay footer. It is outside the `<form>`, so it links to it with `form={formId}`.
 */
export function OverlaySubmitButton({
  formId,
  submitting,
  label,
  submittingLabel,
}: {
  readonly formId: string;
  readonly submitting: boolean;
  readonly label: string;
  readonly submittingLabel: string;
}): ReactElement {
  return (
    <Button type='submit' form={formId} disabled={submitting}>
      {submitting ? <Spinner data-icon='inline-start' /> : null}
      {submitting ? submittingLabel : label}
    </Button>
  );
}
