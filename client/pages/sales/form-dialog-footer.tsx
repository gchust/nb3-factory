import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { useRouteOverlay } from '@/components/use-route-overlay';

export interface FormDialogFooterProps {
  /** The `<form>` id the submit button belongs to through the `form` attribute. */
  readonly formId: string;
  /** Disables both buttons while a submission is in flight. */
  readonly submitting?: boolean;
}

/**
 * The cancel and save buttons shared by the create and edit dialogs. It renders
 * inside the overlay, so it is allowed to call `useRouteOverlay`.
 */
export function FormDialogFooter({
  formId,
  submitting = false,
}: FormDialogFooterProps): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();

  return (
    <>
      <Button
        type='button'
        variant='outline'
        onClick={() => void close()}
        disabled={isClosing || submitting}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={formId} disabled={submitting}>
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}
