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

import { validationField } from './api-error.js';
import type { Customer } from './types.js';

const NAME_MAX = 120;
const INDUSTRY_MAX = 120;

export interface CustomerFormProps {
  /** When editing, the latest record; omit it when creating. */
  readonly customer?: Customer;
  /** The `<form>` id; the container's submit button references it. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSubmitted: (customer: Customer) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
}

/** One form for creating (`POST`) and editing (`PATCH`) a customer. */
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
          .min(1, t('crm.form.nameRequired'))
          .max(NAME_MAX, t('crm.form.nameTooLong', { max: NAME_MAX })),
        industry: z
          .string()
          .trim()
          .max(
            INDUSTRY_MAX,
            t('crm.form.industryTooLong', { max: INDUSTRY_MAX }),
          ),
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
            path: `crm/customers/${customer.id}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Customer }>({
            path: 'crm/customers',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      const field = apiError ? validationField(apiError) : undefined;
      if (customer && apiError?.status === 404) {
        onNotFound?.();
      } else if (field === 'name' || field === 'industry') {
        form.setError(
          field,
          { message: t('crm.form.invalid') },
          { shouldFocus: true },
        );
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
