import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { TicketForm } from './ticket-form.js';
import type { TicketReloadOutletContext } from './types.js';

const FORM_ID = 'ticket-new-form';

/** Raising a ticket, as a dialog over the list. The requester is the signed-in caller, so the form does not ask. */
export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is what `beforeClose` reads, because a close right after a successful
  // create runs before the new state has rendered.
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const busyRef = useRef(false);
  const submittingRef = useRef(false);
  const uploadingRef = useRef(false);
  const syncBusy = (): void => {
    busyRef.current = submittingRef.current || uploadingRef.current;
    setSubmitting(submittingRef.current);
    setUploading(uploadingRef.current);
  };

  return (
    <RouteDialog
      title={t('serviceDesk.form.createTitle')}
      description={t('serviceDesk.form.createDescription')}
      className='sm:max-w-lg'
      // No closing while the request or an upload runs: the × button, Escape, the backdrop and close() all pass
      // through beforeClose first (guideline T3.5).
      beforeClose={() => !busyRef.current}
      footer={<NewTicketFooter busy={submitting || uploading} />}
    >
      <NewTicketBody
        onSubmittingChange={(value) => {
          submittingRef.current = value;
          syncBusy();
        }}
        onUploadingChange={(value) => {
          uploadingRef.current = value;
          syncBusy();
        }}
      />
    </RouteDialog>
  );
}

// useRouteOverlay() works only inside RouteDialog, so the form and the footer each get their own wrapper.
function NewTicketBody({
  onSubmittingChange,
  onUploadingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onUploadingChange: (uploading: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<TicketReloadOutletContext>();
  return (
    <TicketForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onUploadingChange={onUploadingChange}
      onSubmitted={() => {
        // Refresh the list behind the dialog, then close it: the new ticket is the first row (guideline T3.7).
        reload();
        void close();
      }}
    />
  );
}

function NewTicketFooter({ busy }: { readonly busy: boolean }): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={busy}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      {/* Outside the <form>, linked through the form attribute; while it is disabled, Enter does not submit either. */}
      <Button type='submit' form={FORM_ID} disabled={busy}>
        {busy ? <Spinner data-icon='inline-start' /> : null}
        {busy ? t('serviceDesk.form.creating') : t('serviceDesk.form.create')}
      </Button>
    </>
  );
}
