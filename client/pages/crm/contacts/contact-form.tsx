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

import { CustomerPicker } from '../customer-picker.js';
import type { Contact } from '../types.js';

export interface ContactFormProps {
  /** When editing, pass the latest record, just loaded; omit it when creating. */
  readonly contact?: Contact;
  /** The `<form>` id. The submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSubmitted: (contact: Contact) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
}

export function ContactForm({
  contact,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: ContactFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('contacts.form.nameRequired'))
          .max(120, t('contacts.form.nameTooLong', { max: 120 })),
        contact: z
          .string()
          .trim()
          .max(200, t('contacts.form.contactTooLong', { max: 200 })),
        customerId: z.string().min(1, t('crm.form.customerRequired')),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: contact?.name ?? '',
      contact: contact?.contact ?? '',
      customerId: contact?.customerId ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      name: values.name,
      contact: values.contact || null,
      customerId: values.customerId,
    };
    let saved: Contact;
    onSubmittingChange?.(true);
    try {
      const result = contact
        ? await api.request<{ data: Contact }>({
            path: `contacts/${encodeURIComponent(contact.id)}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Contact }>({
            path: 'contacts',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
      } else if (contact && apiError?.status === 404) {
        onNotFound?.();
      } else if (
        apiError?.status === 400 &&
        apiError.reason === 'INVALID_CUSTOMER_REFERENCE'
      ) {
        form.setError(
          'customerId',
          { message: t('crm.form.customerMissing') },
          { shouldFocus: true },
        );
      } else {
        form.setError('root', { message: t('crm.error.requestFailed') });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: contact
        ? t('contacts.edit.success', { name: saved.name })
        : t('contacts.create.success', { name: saved.name }),
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
                {t('contacts.fields.name')}
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
          name='contact'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-contact`}>
                {t('contacts.fields.contact')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-contact`}
                autoComplete='off'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='customerId'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-customer`}>
                {t('contacts.fields.customer')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <CustomerPicker
                id={`${formId}-customer`}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
