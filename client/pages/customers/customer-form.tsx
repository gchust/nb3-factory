import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
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
import { toast } from '@/components/ui/toast';

import { createCustomer, updateCustomer } from '../crm/api.js';
import type { Customer } from '../crm/types.js';

export interface CustomerFormProps {
  /** The latest record when editing; omitted when creating. */
  readonly customer?: Customer;
  /** The id the container links its submit button to. */
  readonly formId: string;
  readonly onSubmitted: (customer: Customer) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** Editing only: the endpoint answered 404, so the record is gone. */
  readonly onNotFound?: () => void;
}

/** One form for creating and editing a customer; the container owns the buttons. */
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
          .min(1, t('crm.customer.form.nameRequired'))
          .max(200, t('crm.customer.form.nameTooLong', { max: 200 })),
        industry: z
          .string()
          .trim()
          .max(100, t('crm.customer.form.industryTooLong', { max: 100 })),
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
    const json = {
      name: values.name,
      industry: values.industry || null,
    };
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
              ? t('crm.error.forbidden')
              : apiError?.status === 400
                ? t('crm.error.invalidInput')
                : t('crm.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toast.add({
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
