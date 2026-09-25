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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { Contact } from '../types.js';
import { useCustomers } from '../use-customers.js';

export interface ContactFormProps {
  /** When editing, pass the record; omit it when creating. */
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
  const { customers } = useCustomers();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('crm.contacts.form.nameRequired'))
          .max(120, t('crm.contacts.form.nameTooLong', { max: 120 })),
        contactInfo: z
          .string()
          .trim()
          .max(200, t('crm.contacts.form.contactInfoTooLong', { max: 200 })),
        customerId: z
          .string()
          .trim()
          .min(1, t('crm.contacts.form.customerRequired')),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: contact?.name ?? '',
      contactInfo: contact?.contactInfo ?? '',
      customerId: contact ? String(contact.customerId) : '',
    },
  });

  const customerItems = useMemo(
    () =>
      (customers ?? []).map((customer) => ({
        value: String(customer.id),
        label: customer.name,
      })),
    [customers],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      name: values.name,
      contactInfo: values.contactInfo || null,
      customerId: Number(values.customerId),
    };
    let saved: Contact;
    onSubmittingChange?.(true);
    try {
      const result = contact
        ? await api.request<{ data: Contact }>({
            path: `contacts/${contact.id}`,
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
      if (apiError?.status === 409) {
        form.setError(
          'name',
          { message: t('crm.contacts.form.nameTaken') },
          { shouldFocus: true },
        );
      } else if (contact && apiError?.status === 404) {
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
      contact
        ? t('crm.contacts.edit.success', { name: saved.name })
        : t('crm.contacts.create.success', { name: saved.name }),
    );
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root?.message;
  const noCustomers = customers !== undefined && customers.length === 0;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{rootError}</AlertDescription>
          </Alert>
        ) : null}
        {noCustomers ? (
          <Alert>
            <AlertCircleIcon />
            <AlertDescription>
              {t('crm.contacts.form.noCustomers')}
            </AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='name'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t('crm.contacts.fields.name')}
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
                {t('crm.contacts.fields.customer')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Select
                items={customerItems}
                value={field.value === '' ? null : field.value}
                onValueChange={(value: string | null) => {
                  if (value != null) field.onChange(value);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-customer`}
                  className='w-full'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue
                    placeholder={t('crm.contacts.fields.customer')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {customerItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                {t('crm.contacts.fields.contactInfo')}
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
      </FieldGroup>
    </form>
  );
}
