import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
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

import type { Customer } from '../types.js';

export interface CustomerFormProps {
  /** When editing, pass the latest record, just loaded; omit it when creating. */
  readonly customer?: Customer;
  /** The `<form>` id. When the submit button is outside the form, the button sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the success message. */
  readonly onSubmitted: (customer: Customer) => void;
  /** Receives `true` when submission starts and `false` when it ends. */
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
          .min(1, t('customers.form.nameRequired'))
          .max(120, t('customers.form.nameTooLong', { max: 120 })),
        industry: z
          .string()
          .trim()
          .max(120, t('customers.form.industryTooLong', { max: 120 })),
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
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
      } else if (customer && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', { message: t('crm.error.requestFailed') });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: customer
        ? t('customers.edit.success', { name: saved.name })
        : t('customers.create.success', { name: saved.name }),
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
                {t('customers.fields.name')}
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
                {t('customers.fields.industry')}
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
