import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

import type { ItTicket } from '../types.js';

const FORM_ID = 'it-ticket-complete-form';

export interface CompleteTicketDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly ticket: ItTicket;
  /** Called after the endpoint confirms the completion, with the updated record. */
  readonly onCompleted: (ticket: ItTicket) => void;
  /** Called when the server reports the ticket is no longer in a completable state. */
  readonly onConflict: () => void;
}

/**
 * Collects the resolution note before completing a ticket. This is a form
 * rather than a confirmation, so it uses a `Dialog`; a plain confirmation
 * would use `AlertDialog`.
 */
export function CompleteTicketDialog({
  open,
  onOpenChange,
  ticket,
  onCompleted,
  onConflict,
}: CompleteTicketDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [submitting, setSubmitting] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        resolution: z
          .string()
          .trim()
          .min(1, t('it.form.resolutionRequired'))
          .max(2000, t('it.form.resolutionTooLong', { max: 2000 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { resolution: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const result = await api.request<{ data: ItTicket }>({
        path: `it/tickets/${encodeURIComponent(String(ticket.id))}`,
        method: 'PATCH',
        json: { action: 'complete', resolution: values.resolution },
      });
      toast.add({
        type: 'success',
        title: t('it.detail.completeSuccess'),
      });
      onCompleted(result.data);
      onOpenChange(false);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 409) {
        // The ticket moved on while the dialog was open: explain and let the
        // caller reload the record instead of retrying the same transition.
        form.setError('root', { message: t('it.error.invalidTransition') });
        onConflict();
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('it.error.forbidden')
              : t('it.error.requestFailed'),
        });
      }
    } finally {
      setSubmitting(false);
    }
  });

  const rootError = form.formState.errors.root?.message;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // No closing while submitting, so the close button, Esc and the
        // backdrop cannot interrupt the request.
        if (submitting && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('it.detail.completeTitle')}</DialogTitle>
          <DialogDescription>
            {t('it.detail.completeDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          id={FORM_ID}
          noValidate
          onSubmit={(event) => void onSubmit(event)}
        >
          <FieldGroup>
            {rootError ? (
              <Alert variant='destructive'>
                <AlertCircleIcon />
                <AlertDescription>{rootError}</AlertDescription>
              </Alert>
            ) : null}
            <Controller
              control={form.control}
              name='resolution'
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${FORM_ID}-resolution`}>
                    {t('it.fields.resolution')}
                    <span aria-hidden='true' className='text-destructive'>
                      *
                    </span>
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id={`${FORM_ID}-resolution`}
                    rows={5}
                    placeholder={t('it.form.resolutionPlaceholder')}
                    aria-required='true'
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button type='submit' form={FORM_ID} disabled={submitting}>
            {submitting ? <Spinner data-icon='inline-start' /> : null}
            {submitting ? t('actions.saving') : t('it.detail.complete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
