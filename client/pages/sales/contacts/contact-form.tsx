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

import { CustomerPicker } from '../customer-picker.js';
import { classifySalesFailure } from '../form-failure.js';
import type { Contact } from '../types.js';

export interface ContactFormProps {
  /** When editing, the latest record; omit it when creating. */
  readonly contact?: Contact;
  /** The `<form>` id. A submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the message. */
  readonly onSubmitted: (contact: Contact) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes first. */
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
          .min(1, t('sales.contact.nameRequired'))
          .max(128, t('sales.contact.nameTooLong', { max: 128 })),
        contactInfo: z
          .string()
          .trim()
          .max(256, t('sales.contact.contactInfoTooLong', { max: 256 })),
        customerId: z.string().min(1, t('sales.contact.customerRequired')),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: contact?.name ?? '',
      contactInfo: contact?.contactInfo ?? '',
      customerId: contact?.customerId ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      name: values.name,
      contactInfo: values.contactInfo || null,
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
      const failure = classifySalesFailure(error);
      if (failure.kind === 'reference') {
        form.setError(
          'customerId',
          { message: t('sales.contact.customerNotFound') },
          { shouldFocus: true },
        );
      } else if (failure.kind === 'sessionExpired') {
        form.setError('root', { type: 'sessionExpired' });
      } else if (failure.kind === 'notFound' && contact) {
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
      title: contact
        ? t('sales.contact.updated', { name: saved.name })
        : t('sales.contact.created', { name: saved.name }),
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
                {t('sales.contact.name')}
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
          name='contactInfo'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-contact-info`}>
                {t('sales.contact.contactInfo')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-contact-info`}
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
                {t('sales.contact.customer')}
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
