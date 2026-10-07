import { zodResolver } from '@hookform/resolvers/zod';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import { classifySalesFailure } from '../form-failure.js';
import type { Customer } from '../types.js';

export interface CustomerFormProps {
  /** When editing, the latest record; omit it when creating. */
  readonly customer?: Customer;
  /** The `<form>` id. A submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the message. */
  readonly onSubmitted: (customer: Customer) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes first. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
}

export function CustomerForm({
  customer,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: CustomerFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('sales.customer.nameRequired'))
          .max(128, t('sales.customer.nameTooLong', { max: 128 })),
        industry: z
          .string()
          .trim()
          .max(128, t('sales.customer.industryTooLong', { max: 128 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: customer?.name ?? '',
      industry: customer?.industry ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      name: values.name,
      industry: values.industry || null,
    };
    let saved: Customer;
    onSubmittingChange?.(true);
    try {
      const result = customer
        ? await api.request<{ data: Customer }>({
            path: `customers/${encodeURIComponent(customer.id)}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Customer }>({
            path: 'customers',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      const failure = classifySalesFailure(error);
      if (failure.kind === 'nameTaken') {
        form.setError(
          'name',
          { message: t('sales.customer.nameTaken') },
          { shouldFocus: true },
        );
      } else if (failure.kind === 'sessionExpired') {
        form.setError('root', { type: 'sessionExpired' });
      } else if (failure.kind === 'notFound' && customer) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            failure.kind === 'forbidden'
              ? t('sales.error.forbidden')
              : t('sales.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: customer
        ? t('sales.customer.updated', { name: saved.name })
        : t('sales.customer.created', { name: saved.name }),
    });
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
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
          name='name'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t('sales.customer.name')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-name`}
                autoComplete='off'
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='industry'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-industry`}>
                {t('sales.customer.industry')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-industry`}
                autoComplete='off'
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
