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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';

import { CustomerSelect } from '../sales/customer-select.js';
import { createContact, updateContact } from '../sales/api.js';
import type { Contact } from '../sales/types.js';

export interface ContactFormProps {
  /** When editing, pass the latest record, just loaded; omit it when creating. */
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

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('sales.contacts.form.nameRequired'))
          .max(120, t('sales.contacts.form.nameTooLong', { max: 120 })),
        contactInfo: z
          .string()
          .trim()
          .max(200, t('sales.contacts.form.contactInfoTooLong', { max: 200 })),
        customerId: z
          .number()
          .optional()
          .refine((value) => typeof value === 'number' && value > 0, {
            message: t('sales.contacts.form.customerRequired'),
          })
          .transform((value) => value as number),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: contact?.name ?? '',
      contactInfo: contact?.contactInfo ?? '',
      customerId: contact?.customerId ?? undefined,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const input = {
      name: values.name,
      contactInfo: values.contactInfo || null,
      customerId: values.customerId,
    };
    let saved: Contact;
    onSubmittingChange?.(true);
    try {
      saved = contact
        ? await updateContact(api, contact.id, input)
        : await createContact(api, input);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (contact && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('sales.errorForbidden')
              : t('sales.errorRequestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toast.add({
      type: 'success',
      title: contact
        ? t('sales.contacts.editSuccess', { name: saved.name })
        : t('sales.contacts.createSuccess', { name: saved.name }),
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
                {t('sales.name')}
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
                {t('sales.contactInfo')}
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
                {t('sales.customer')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <CustomerSelect
                id={`${formId}-customer`}
                value={field.value}
                onChange={(next) => field.onChange(next)}
                invalid={fieldState.invalid}
              />
              <FieldDescription>
                {t('sales.contacts.form.customerHint')}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
