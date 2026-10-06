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

import { createContact, updateContact } from './api.js';
import { CustomerSelect } from './customer-select.js';
import type { Contact } from './types.js';

export interface ContactFormProps {
  /** When editing, pass the latest record; omit it when creating. */
  readonly contact?: Contact;
  readonly formId: string;
  readonly onSubmitted: (contact: Contact) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
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
          .min(1, t('crm.contact.form.nameRequired'))
          .max(128, t('crm.contact.form.nameTooLong')),
        customerId: z
          .number({ error: t('crm.contact.form.customerRequired') })
          .int()
          .positive(t('crm.contact.form.customerRequired')),
        phone: z.string().trim().max(64, t('crm.contact.form.phoneTooLong')),
        email: z
          .string()
          .trim()
          .max(256, t('crm.contact.form.emailTooLong'))
          .refine(
            (value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
            { message: t('crm.contact.form.emailInvalid') },
          ),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: contact?.name ?? '',
      // 0 means "nothing selected"; `.positive()` turns it into the required error.
      customerId: contact?.customerId ?? 0,
      phone: contact?.phone ?? '',
      email: contact?.email ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const changes = {
      name: values.name,
      customerId: values.customerId,
      phone: values.phone || null,
      email: values.email || null,
    };
    let saved: Contact;
    onSubmittingChange?.(true);
    try {
      saved = contact
        ? await updateContact(api, contact.id, changes)
        : await createContact(api, changes);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.code === 'NAME_TAKEN') {
        form.setError(
          'name',
          { message: t('crm.contact.form.nameTaken') },
          { shouldFocus: true },
        );
      } else if (
        apiError?.code === 'CUSTOMER_REQUIRED' ||
        apiError?.code === 'CUSTOMER_NOT_FOUND'
      ) {
        form.setError(
          'customerId',
          { message: t('crm.contact.form.customerRequired') },
          { shouldFocus: true },
        );
      } else if (contact && apiError?.status === 404) {
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
      title: contact
        ? t('crm.contact.edit.success', { name: saved.name })
        : t('crm.contact.create.success', { name: saved.name }),
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
                {t('crm.contact.fields.name')}
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
          name='customerId'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-customer`}>
                {t('crm.contact.fields.customer')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <CustomerSelect
                id={`${formId}-customer`}
                ref={field.ref}
                value={field.value > 0 ? field.value : null}
                onChange={(value) => field.onChange(value)}
                onBlur={field.onBlur}
                invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='phone'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-phone`}>
                {t('crm.contact.fields.phone')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-phone`}
                autoComplete='off'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='email'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-email`}>
                {t('crm.contact.fields.email')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-email`}
                type='email'
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
