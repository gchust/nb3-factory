import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

import type { Ticket } from './types.js';

export interface ResolutionFormProps {
  /** The ticket being resolved. */
  readonly ticketId: number;
  /** The `<form>` id; the submit button in the drawer footer sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the ticket the endpoint returned. */
  readonly onCompleted: (ticket: Ticket) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` before `onCompleted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
}

/** The handler's resolution: the one field a ticket needs to be marked completed. */
export function ResolutionForm({
  ticketId,
  formId,
  onCompleted,
  onSubmittingChange,
}: ResolutionFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const schema = useMemo(
    () =>
      z.object({
        resolution: z
          .string()
          .trim()
          .min(1, t('tickets.resolve.resolutionRequired'))
          .max(5000, t('tickets.resolve.resolutionTooLong', { max: 5000 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { resolution: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    onSubmittingChange?.(true);
    let updated: Ticket;
    try {
      const result = await api.request<{ data: Ticket }>({
        path: `tickets/${encodeURIComponent(String(ticketId))}/complete`,
        method: 'POST',
        json: { resolution: values.resolution },
      });
      updated = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 403) {
        form.setError('root', { message: t('tickets.error.forbidden') });
      } else if (apiError?.status === 404) {
        form.setError('root', { message: t('tickets.error.notFound') });
      } else if (apiError?.status === 409) {
        form.setError('root', { message: t('tickets.error.stateConflict') });
      } else {
        form.setError('root', {
          message: t('tickets.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({ type: 'success', title: t('tickets.resolve.success') });
    onCompleted(updated);
  });

  const rootError = form.formState.errors.root?.message;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
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
              <FieldLabel htmlFor={`${formId}-resolution`}>
                {t('tickets.fields.resolution')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-resolution`}
                rows={4}
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                {t('tickets.resolve.description')}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
