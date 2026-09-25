import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

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
  /** When editing, pass the record; omit it when creating. */
  readonly customer?: Customer;
  /** The `<form>` id; a submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  readonly onSubmitted: (customer: Customer) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record no longer exists. */
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

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('crm.customers.form.nameRequired'))
          .max(120, t('crm.customers.form.nameTooLong', { max: 120 })),
        industry: z
          .string()
          .trim()
          .max(120, t('crm.customers.form.industryTooLong', { max: 120 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: customer?.name ?? '',
      industry: customer?.industry ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const json = { name: values.name, industry: values.industry || null };
    let saved: Customer;
    onSubmittingChange?.(true);
    try {
      const result = customer
        ? await api.request<{ data: Customer }>({
            path: `customers/${customer.id}`,
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
      if (apiError?.status === 409) {
        form.setError(
          'name',
          { message: t('crm.customers.form.nameTaken') },
          { shouldFocus: true },
        );
      } else if (customer && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('crm.error.forbidden')
              : t('crm.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toast.success(
      customer
        ? t('crm.customers.edit.success', { name: saved.name })
        : t('crm.customers.create.success', { name: saved.name }),
    );
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
          name='name'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t('crm.customers.fields.name')}
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
                {t('crm.customers.fields.industry')}
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
