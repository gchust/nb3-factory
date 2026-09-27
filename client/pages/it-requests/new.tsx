import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { TicketForm } from './ticket-form.js';
import type { ItRequestsOutletContext } from './types.js';

const FORM_ID = 'it-ticket-new-form';

/** Route `/it/requests/new`: the create dialog. */
export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref lets beforeClose read the value
  // immediately, before the state change has rendered.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('it.create.title')}
      description={t('it.create.description')}
      className='sm:max-w-lg'
      // No closing while submitting: the close button, Esc, the backdrop and
      // close() all pass through beforeClose first.
      beforeClose={() => !submittingRef.current}
      footer={<NewTicketFooter submitting={submitting} />}
    >
      <NewTicketBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

// useRouteOverlay() is only available inside RouteDialog, so the form and the
// footer each get their own wrapper component.
function NewTicketBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ItRequestsOutletContext>();
  return (
    <TicketForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewTicketFooter({
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
      {/* The button sits outside the <form> and is linked through `form`; while
          it is disabled, Enter does not submit either. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
