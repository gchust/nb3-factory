import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';

import { toDateTimeLocal, toInstant } from './datetime.js';
import type { Visitor } from './types.js';

export interface VisitorCheckoutFormProps {
  readonly visitor: Visitor;
  readonly formId: string;
  /** Called after a successful checkout with the updated record. The form has already shown the success message. */
  readonly onSubmitted: (visitor: Visitor) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** The record disappeared while the dialog was open. The caller refreshes the register. */
  readonly onNotFound?: () => void;
  /** The record was already checked out elsewhere. The caller refreshes the register. */
  readonly onStale?: () => void;
}

/** Records a departure time. The departure may not be earlier than the arrival. */
export function VisitorCheckoutForm({
  visitor,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
  onStale,
}: VisitorCheckoutFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const schema = useMemo(() => {
    const arrival = Date.parse(visitor.arrivedAt);
    return z.object({
      departedAt: z
        .string()
        .min(1, t('visitors.checkout.required'))
        .refine(
          (value) => toInstant(value) !== undefined,
          t('visitors.checkout.invalid'),
        )
        .refine((value) => {
          const departure = toInstant(value);
          return (
            departure === undefined ||
            Number.isNaN(arrival) ||
            Date.parse(departure) >= arrival
          );
        }, t('visitors.checkout.departedBeforeArrived')),
    });
  }, [t, visitor.arrivedAt]);

  // The departure time defaults to "now", read once when the form opens.
  const [defaultDepartedAt] = useState(() => toDateTimeLocal(new Date()));

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { departedAt: defaultDepartedAt },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const departedAt = toInstant(values.departedAt);
    if (!departedAt) {
      form.setError(
        'departedAt',
        { message: t('visitors.checkout.invalid') },
        { shouldFocus: true },
      );
      return;
    }

    let saved: Visitor;
    onSubmittingChange?.(true);
    try {
      const result = await api.request<
        { data: Visitor },
        { departedAt: string }
      >({
        path: `visitors/${visitor.id}/checkout`,
        method: 'PATCH',
        json: { departedAt },
      });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 404) {
        onNotFound?.();
        form.setError('root', { message: t('visitors.error.notFound') });
      } else if (
        apiError?.status === 409 ||
        apiError?.code === 'ALREADY_DEPARTED'
      ) {
        onStale?.();
        form.setError('root', {
          message: t('visitors.checkout.alreadyDeparted'),
        });
      } else if (
        apiError?.status === 400 &&
        apiError.code === 'DEPARTED_BEFORE_ARRIVED'
      ) {
        form.setError(
          'departedAt',
          { message: t('visitors.checkout.departedBeforeArrived') },
          { shouldFocus: true },
        );
      } else if (
        apiError?.status === 400 &&
        apiError.code === 'VALIDATION_ERROR'
      ) {
        form.setError(
          'departedAt',
          { message: t('visitors.checkout.invalid') },
          { shouldFocus: true },
        );
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('visitors.error.forbidden')
              : t('visitors.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }

    toast.add({
      type: 'success',
      title: t('visitors.checkout.success', { name: saved.name }),
    });
    onSubmitted(saved);
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
          name='departedAt'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-departed-at`}>
                {t('visitors.fields.departedAt')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-departed-at`}
                type='datetime-local'
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
