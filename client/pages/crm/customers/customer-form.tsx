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

import { createCustomer, updateCustomer } from '../api.js';
import type { Customer } from '../types.js';

export interface CustomerFormProps {
  /** When editing, the latest record, just loaded; omit it when creating. */
  readonly customer?: Customer;
  /** The `<form>` id. A submit button outside the form links to it with `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the success message. */
  readonly onSubmitted: (customer: Customer) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` precedes `onSubmitted`. */
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
  const toaster = useToaster();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('crm.customers.form.nameRequired'))
          .max(255, t('crm.common.tooLong', { max: 255 })),
        industry: z
          .string()
          .trim()
          .max(255, t('crm.common.tooLong', { max: 255 })),
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
      saved = customer
        ? await updateCustomer(api, customer.id, json)
        : await createCustomer(api, json);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (customer && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('crm.common.forbidden')
              : t('crm.common.loadFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: customer
        ? t('crm.customers.updated', { name: saved.name })
        : t('crm.customers.created', { name: saved.name }),
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
                {t('crm.customers.form.name')}
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
                {t('crm.customers.form.industry')}
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
