import { zodResolver } from '@hookform/resolvers/zod';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useOutletContext, useParams } from 'react-router';
import { z } from 'zod';

import { RouteDialog } from '@/components/route-dialog';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
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
import { useRouteOverlay } from '@/components/use-route-overlay';

import type { Ticket, TicketDetailOutletContext } from '../types.js';

const TICKET_RESOURCE = 'tickets';
const FORM_ID = 'ticket-complete-form';

/** Route `/tickets/:ticketId/complete`, stacked on the detail drawer: finishes a ticket with its resolution. */
export default function CompleteTicketPage(): ReactElement {
  const { t } = useTranslation();
  // Completing a ticket is reserved for a handler; anyone else who reaches this URL directly is told so instead of
  // being handed a form the server would refuse.
  const { can, isPending } = useCan({
    resource: { type: 'composite', id: TICKET_RESOURCE },
    action: 'complete',
  });

  // The state disables the buttons; the ref is for beforeClose to read: when close() runs right after a successful save, the new state value has not rendered yet.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  if (isPending) {
    return (
      <RouteDialog title={t('tickets.complete.title')}>
        <div role='status' aria-label={t('status.loading')}>
          <Spinner />
        </div>
      </RouteDialog>
    );
  }

  if (!can) {
    return (
      <RouteDialog title={t('tickets.complete.title')}>
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{t('tickets.error.forbidden')}</AlertDescription>
        </Alert>
      </RouteDialog>
    );
  }

  return (
    <RouteDialog
      title={t('tickets.complete.title')}
      description={t('tickets.complete.description')}
      className='sm:max-w-lg'
      // No closing while submitting: the × button, Esc, clicking the backdrop and close() all go through beforeClose first.
      beforeClose={() => !submittingRef.current}
      footer={<CompleteTicketFooter submitting={submitting} />}
    >
      <CompleteTicketBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function CompleteTicketBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { ticketId = '' } = useParams();
  const { close } = useRouteOverlay();
  const { onUpdated, onNotFound, onStale } =
    useOutletContext<TicketDetailOutletContext>();

  // The schema lives in the component so validation messages can be built with t and follow the current language.
  const schema = useMemo(
    () =>
      z.object({
        resolution: z
          .string()
          .trim()
          .min(1, t('tickets.form.resolutionRequired'))
          .max(5000, t('tickets.form.resolutionTooLong', { max: 5000 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { resolution: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    let completed: Ticket;
    onSubmittingChange(true);
    try {
      const result = await api.request<{ data: Ticket }>({
        path: `tickets/${encodeURIComponent(ticketId)}/complete`,
        method: 'POST',
        json: { resolution: values.resolution },
      });
      completed = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        // The session ended. Keep the input and let the user choose to sign in again.
        form.setError('root', { type: 'sessionExpired' });
      } else if (apiError?.status === 404) {
        // The record is gone; the drawer explains it and the list behind refreshes.
        onNotFound();
        void close();
      } else if (
        apiError?.status === 400 &&
        apiError.reason === 'TICKET_NOT_IN_PROGRESS'
      ) {
        // Someone else completed it first (or it was never started): show the current state, do not resubmit.
        form.setError('root', { message: t('tickets.complete.notInProgress') });
        onStale();
      } else {
        // Other errors appear at the top of the form, without the raw message the backend returned.
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('tickets.error.forbidden')
              : t('tickets.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange(false);
    }
    // A dialog has no toast: the success message stays in the drawer that is about to show the completed ticket.
    onUpdated(completed);
    void close();
  });

  const rootError = form.formState.errors.root;

  return (
    <form id={FORM_ID} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError?.type === 'sessionExpired' ? (
          <SessionExpiredAlert />
        ) : rootError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{rootError.message}</AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='resolution'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${FORM_ID}-resolution`}>
                {t('tickets.fields.resolution')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Textarea
                {...field}
                id={`${FORM_ID}-resolution`}
                rows={4}
                autoFocus
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                {t('tickets.complete.resolutionHint')}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}

function CompleteTicketFooter({
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
      {/* The button is outside the <form> and linked through the form attribute; while it is disabled, Enter does not submit either. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('tickets.actions.complete')}
      </Button>
    </>
  );
}
