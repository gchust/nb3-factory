import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import type { ItTicketDetailOutletContext, ItTicketView } from '../types.js';

const FORM_ID = 'it-ticket-complete-form';
const RESOLUTION_MAX_LENGTH = 5000;

/** Route `/it-tickets/:ticketId/complete`: the handler's completion note, stacked on the detail drawer. */
export default function CompleteItTicketPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  return (
    <RouteDialog
      title={t('itTickets.complete.title')}
      description={t('itTickets.complete.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<CompleteItTicketFooter submitting={submitting} />}
    >
      <CompleteItTicketBody
        onSubmittingChange={(value) => {
          submittingRef.current = value;
          setSubmitting(value);
        }}
      />
    </RouteDialog>
  );
}

function CompleteItTicketBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { ticket, onCompleted, onNotFound } =
    useOutletContext<ItTicketDetailOutletContext>();

  const [resolution, setResolution] = useState('');
  const [error, setError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const submittingGuardRef = useRef(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (submittingGuardRef.current) return;
    if (resolution.trim() === '') {
      setError(t('itTickets.validation.resolutionRequired'));
      return;
    }
    submittingGuardRef.current = true;
    onSubmittingChange(true);
    setSubmitError(undefined);
    try {
      const { data } = await api.request<{ data: ItTicketView }>({
        path: `it-tickets/${encodeURIComponent(ticket.id)}/complete`,
        method: 'POST',
        json: { resolution },
      });
      toaster.show({
        type: 'success',
        title: t('itTickets.complete.success'),
      });
      submittingGuardRef.current = false;
      onSubmittingChange(false);
      onCompleted(data);
      void close();
    } catch (caught) {
      submittingGuardRef.current = false;
      onSubmittingChange(false);
      if (caught instanceof ApiClientError && caught.status === 404) {
        onNotFound();
        void close();
        return;
      }
      setSubmitError(
        caught instanceof ApiClientError && caught.status === 403
          ? t('itTickets.error.forbidden')
          : t('itTickets.error.requestFailed'),
      );
    }
  }

  return (
    <form
      id={FORM_ID}
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      <FieldGroup>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor='it-ticket-resolution'>
            {t('itTickets.fields.resolution')}
          </FieldLabel>
          <Textarea
            id='it-ticket-resolution'
            rows={5}
            value={resolution}
            maxLength={RESOLUTION_MAX_LENGTH}
            onChange={(event) => {
              setResolution(event.target.value);
              if (error) setError(undefined);
            }}
            placeholder={t('itTickets.complete.resolutionPlaceholder')}
            aria-invalid={error ? true : undefined}
          />
          <FieldDescription>
            {t('itTickets.complete.resolutionHint')}
          </FieldDescription>
          <FieldError>{error}</FieldError>
        </Field>
      </FieldGroup>

      {submitError ? (
        <Alert variant='destructive' className='mt-4'>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

function CompleteItTicketFooter({
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
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('itTickets.complete.submit')}
      </Button>
    </>
  );
}
