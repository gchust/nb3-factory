import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import { completeItTicket } from './api.js';
import type { ItTicketDetailOutletContext } from './types.js';

const FORM_ID = 'it-ticket-complete-form';
const MAX_RESOLUTION_LENGTH = 5000;

/** Route `/it-support/:ticketId/complete`: the processor records the result and completes the ticket. */
export default function CompleteItTicketPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const setSubmittingBoth = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('itSupport.complete.title')}
      description={t('itSupport.complete.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<CompleteFooter submitting={submitting} />}
    >
      <CompleteBody onSubmittingChange={setSubmittingBoth} />
    </RouteDialog>
  );
}

function CompleteBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const { ticketId = '' } = useParams();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { onUpdated, onNotFound, refresh } =
    useOutletContext<ItTicketDetailOutletContext>();

  const [resolution, setResolution] = useState('');
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = resolution.trim();
    if (trimmed === '') {
      setError(t('itSupport.complete.resolutionRequired'));
      return;
    }
    setError(undefined);
    onSubmittingChange(true);
    try {
      const next = await completeItTicket(api, ticketId, trimmed);
      toaster.show({ type: 'success', title: t('itSupport.complete.success') });
      onSubmittingChange(false);
      onUpdated(next);
      void close();
    } catch (caught: unknown) {
      onSubmittingChange(false);
      const status = caught instanceof ApiClientError ? caught.status : 0;
      if (status === 404) {
        // Somebody else deleted it, or this identity may not see it any more.
        onNotFound();
        void close();
        return;
      }
      if (status === 409) {
        // Another processor completed it first: reload the drawer to show the current state.
        setError(t('itSupport.error.invalidState'));
        refresh();
        return;
      }
      setError(t('itSupport.error.requestFailed'));
    }
  }

  return (
    <form
      id={FORM_ID}
      className='flex flex-col gap-5'
      onSubmit={(event) => void submit(event)}
    >
      <Field>
        <FieldLabel htmlFor='it-ticket-resolution'>
          {t('itSupport.field.resolution')}
        </FieldLabel>
        <Textarea
          id='it-ticket-resolution'
          value={resolution}
          maxLength={MAX_RESOLUTION_LENGTH}
          rows={5}
          required
          aria-invalid={error === t('itSupport.complete.resolutionRequired')}
          placeholder={t('itSupport.complete.resolutionPlaceholder')}
          onChange={(event) => setResolution(event.target.value)}
        />
      </Field>

      {error ? <FieldError>{error}</FieldError> : null}
    </form>
  );
}

function CompleteFooter({
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
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting
          ? t('itSupport.complete.submitting')
          : t('itSupport.complete.submit')}
      </Button>
    </>
  );
}
