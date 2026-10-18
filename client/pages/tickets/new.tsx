import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import type { TicketsOutletContext } from './context.js';
import { TicketForm } from './ticket-form.js';

const FORM_ID = 'ticket-new-form';

/** Route `/tickets/new`: the "report an issue" dialog. */
export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  // The ref is for beforeClose, which runs before the state update has rendered.
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('tickets.create.title')}
      description={t('tickets.create.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewTicketFooter submitting={submitting} />}
    >
      <NewTicketBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

// useRouteOverlay() can only be called inside RouteDialog, so the form and the footer buttons each get a wrapper.
function NewTicketBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<TicketsOutletContext>();
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
      {/* Outside the <form>, linked through the form attribute; disabled, Enter does not submit either. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
