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

import {
  notifySalesDataChanged,
  salesErrorMessageKey,
  type Customer,
} from '../shared';

export interface CustomerFormProps {
  /** When editing, the latest record, just loaded; omit it when creating. */
  readonly customer?: Customer;
  /** The `<form>` id; the footer's submit button is linked through it. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the toast. */
  readonly onSubmitted: (customer: Customer) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
}

/** The customer name/industry form shared by the create and edit dialogs. It renders no buttons. */
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
          .min(1, t('sales.form.customerNameRequired'))
          .max(255, t('sales.form.nameTooLong', { max: 255 })),
        industry: z
          .string()
          .trim()
          .max(255, t('sales.form.industryTooLong', { max: 255 })),
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
      const result = customer
        ? await api.request<{ data: Customer }>({
            path: `sales/customers/${customer.id}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Customer }>({
            path: 'sales/customers',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      if (customer && error instanceof ApiClientError && error.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', { message: t(salesErrorMessageKey(error)) });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: customer
        ? t('sales.customer.updateSuccess', { name: saved.name })
        : t('sales.customer.createSuccess', { name: saved.name }),
    });
    // Every list and detail view reading the sales revision refetches, so the page behind the dialog shows the change.
    notifySalesDataChanged();
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
