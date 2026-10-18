import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { DeviceForm } from './device-form.js';
import type { DevicesOutletContext } from './types.js';

const FORM_ID = 'device-new-form';

/** The create dialog, opened at `/devices/new` over the list. */
export default function NewDevicePage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is what beforeClose reads, because a close() right after a successful
  // save would otherwise still see the "submitting" render.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('devices.create.title')}
      description={t('devices.form.description')}
      className='sm:max-w-lg'
      // No closing while submitting: the ×, Esc, the backdrop and close() all go through beforeClose first.
      beforeClose={() => !submittingRef.current}
      footer={<NewDeviceFooter submitting={submitting} />}
    >
      <NewDeviceBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

// useRouteOverlay() may only be called inside the overlay, so the form and the footer each get their own wrapper.
function NewDeviceBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<DevicesOutletContext>();
  return (
    <DeviceForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        // Refresh the list behind the dialog first, then close.
        reload();
        void close();
      }}
    />
  );
}

function NewDeviceFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting || isClosing}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      {/* The button is outside the <form> and linked through formId; while it is disabled, Enter does not submit either. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
