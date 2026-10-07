import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { ItTicketForm } from './it-ticket-form.js';
import type { ItTicketsOutletContext } from './types.js';

const FORM_ID = 'it-ticket-new-form';

/**
 * Submitting a ticket, opened as the list's `new` child route.
 *
 * The dialog holds no open state of its own: it is on screen exactly while the
 * URL points at `new`, so the back button closes it and a link opens it.
 */
export default function NewItTicketPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is what `beforeClose` reads, because
  // after a successful save the new state value has not rendered yet.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('itTickets.create.title')}
      description={t('itTickets.form.description')}
      className='sm:max-w-lg'
      // Nothing closes the dialog while a submission is in flight: the ×
      // button, Esc, the backdrop and close() all pass through beforeClose.
      beforeClose={() => !submittingRef.current}
      footer={<NewItTicketFooter submitting={submitting} />}
    >
      <NewItTicketBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

// `useRouteOverlay()` may only be called from a component rendered inside the
// dialog, so the form and the footer each get their own wrapper.
function NewItTicketBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ItTicketsOutletContext>();
  return (
    <ItTicketForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewItTicketFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      {/* The button sits outside the <form> and is linked through `form`;
          while it is disabled, Enter does not submit either. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
