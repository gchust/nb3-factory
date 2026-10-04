import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

/**
 * The submit and cancel buttons both dialogs share. They render inside the
 * overlay, so `useRouteOverlay()` works here. The submit button is outside the
 * `<form>` and linked to it through `form={formId}`.
 */
export function FormFooter({
  formId,
  submitting,
  submitLabel,
}: {
  readonly formId: string;
  readonly submitting: boolean;
  readonly submitLabel: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <CloseButton label={t('sales.actions.cancel')} disabled={submitting} />
      <Button type='submit' form={formId} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('sales.actions.saving') : submitLabel}
      </Button>
    </>
  );
}

/** A lone close button for the states where only closing makes sense (not found, no permission, nothing to choose from). */
export function CloseButton({
  label,
  disabled = false,
}: {
  readonly label: string;
  readonly disabled?: boolean;
}): ReactElement {
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

/** The shape of the fields a form is about to render, so the dialog does not jump. */
export function FormSkeleton({
  fields = 4,
}: {
  readonly fields?: number;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      role='status'
      aria-label={t('sales.loading')}
      className='flex flex-col gap-5'
    >
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className='flex flex-col gap-2'>
          <Skeleton className='h-4 w-16' />
          <Skeleton className='h-8 w-full' />
        </div>
      ))}
    </div>
  );
}
