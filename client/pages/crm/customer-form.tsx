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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import { createCustomer, updateCustomer } from './api.js';
import type { Customer } from './types.js';

export interface CustomerFormProps {
  /** When editing, pass the latest record; omit it when creating. */
  readonly customer?: Customer;
  /** The `<form>` id; the submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSubmitted: (customer: Customer) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404. */
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
          .min(1, t('crm.customer.form.nameRequired'))
          .max(128, t('crm.customer.form.nameTooLong')),
        industry: z
          .string()
          .trim()
          .max(128, t('crm.customer.form.industryTooLong')),
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
    const changes = {
      name: values.name,
      industry: values.industry || null,
    };
    let saved: Customer;
    onSubmittingChange?.(true);
    try {
      saved = customer
        ? await updateCustomer(api, customer.id, changes)
        : await createCustomer(api, changes);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.code === 'NAME_TAKEN') {
        form.setError(
          'name',
          { message: t('crm.customer.form.nameTaken') },
          { shouldFocus: true },
        );
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
        ? t('crm.customer.edit.success', { name: saved.name })
        : t('crm.customer.create.success', { name: saved.name }),
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
          name='name'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t('crm.customer.fields.name')}
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
                {t('crm.customer.fields.industry')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-industry`}
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
