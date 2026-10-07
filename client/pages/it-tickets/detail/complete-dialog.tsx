import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useOutletContext, useParams } from 'react-router';
import { z } from 'zod';

import { RouteDialog } from '@/components/route-dialog';
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

import { completeItTicket } from '../it-ticket-api.js';
import { ticketErrorMessage } from '../it-ticket-errors.js';
import { SessionExpiredNotice } from '../session-expired-notice.js';
import type { ItTicketDetailOutletContext } from '../types.js';

const FORM_ID = 'it-ticket-complete-form';

/**
 * Recording the resolution, opened as the drawer's `complete` child route so it
 * stacks on the ticket instead of replacing it.
 *
 * A ticket cannot be completed without a note: the note is what the employee
 * reads afterwards, so the form refuses to submit an empty one and the server
 * refuses it again.
 */
export default function CompleteItTicketPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('itTickets.complete.title')}
      description={t('itTickets.complete.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<CompleteItTicketFooter submitting={submitting} />}
    >
      <CompleteItTicketBody onSubmittingChange={handleSubmittingChange} />
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
  const { ticketId = '' } = useParams();
  const { close } = useRouteOverlay();
  const { onUpdated, onGone } = useOutletContext<ItTicketDetailOutletContext>();

  // The schema lives in the component so its validation messages follow the
  // current language.
  const schema = useMemo(
    () =>
      z.object({
        resolutionNote: z
          .string()
          .trim()
          .min(1, t('itTickets.complete.noteRequired'))
          .max(2000, t('itTickets.complete.noteTooLong', { max: 2000 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { resolutionNote: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    onSubmittingChange?.(true);
    try {
      const updated = await completeItTicket(
        api,
        ticketId,
        values.resolutionNote,
      );
      toaster.show({
        type: 'success',
        title: t('itTickets.complete.success', { title: updated.title }),
      });
      // The drawer shows the record the endpoint returned, then the list behind
      // it refreshes; only then does this dialog close. Closing is guarded
      // while the request is in flight, so the guard goes first.
      onUpdated(updated);
      onSubmittingChange?.(false);
      await close();
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
      } else if (apiError?.status === 404) {
        // The ticket disappeared while the form was open: close the form and
        // let the drawer explain it.
        onGone();
        onSubmittingChange?.(false);
        await close();
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('itTickets.error.forbidden')
              : // A refused transition carries a reason; the wording is chosen
                // from it, never from the server's developer-facing message.
                ticketErrorMessage(t, error),
        });
      }
    } finally {
      onSubmittingChange?.(false);
    }
  });

  const rootError = form.formState.errors.root;

  return (
    <form id={FORM_ID} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError?.type === 'sessionExpired' ? (
          <SessionExpiredNotice />
        ) : rootError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{rootError.message}</AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='resolutionNote'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${FORM_ID}-note`}>
                {t('itTickets.fields.resolutionNote')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Textarea
                {...field}
                id={`${FORM_ID}-note`}
                rows={5}
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                {t('itTickets.complete.hint')}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
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
        {submitting ? t('actions.saving') : t('itTickets.complete.action')}
      </Button>
    </>
  );
}
