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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';

import { createContact, listCustomers, updateContact } from '../crm/api.js';
import type { Contact } from '../crm/types.js';
import { useApiData } from '../crm/use-api-data.js';

export interface ContactFormProps {
  /** The latest record when editing; omitted when creating. */
  readonly contact?: Contact;
  /** The id the container links its submit button to. */
  readonly formId: string;
  readonly onSubmitted: (contact: Contact) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** Editing only: the endpoint answered 404, so the record is gone. */
  readonly onNotFound?: () => void;
}

/** One form for creating and editing a contact; the container owns the buttons. */
export function ContactForm({
  contact,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: ContactFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  // The customer options are loaded here so the form is self-contained on both routes.
  const customers = useApiData('crm:customer-options', (signal) =>
    listCustomers(api, signal),
  );

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('crm.contact.form.nameRequired'))
          .max(200, t('crm.contact.form.nameTooLong', { max: 200 })),
        customerId: z.string().min(1, t('crm.contact.form.customerRequired')),
        phone: z
          .string()
          .trim()
          .max(50, t('crm.contact.form.phoneTooLong', { max: 50 })),
        email: z.email(t('crm.contact.form.emailInvalid')).or(z.literal('')),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: contact?.name ?? '',
      customerId: contact ? String(contact.customerId) : '',
      phone: contact?.phone ?? '',
      email: contact?.email ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      name: values.name,
      customerId: Number(values.customerId),
      phone: values.phone || null,
      email: values.email || null,
    };
    let saved: Contact;
    onSubmittingChange?.(true);
    try {
      saved = contact
        ? await updateContact(api, contact.id, json)
        : await createContact(api, json);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (contact && apiError?.status === 404) {
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
      title: contact
        ? t('crm.contact.edit.success', { name: saved.name })
        : t('crm.contact.create.success', { name: saved.name }),
    });
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root?.message;
  const customerItems = (customers.data ?? []).map((customer) => ({
    value: String(customer.id),
    label: customer.name,
  }));

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
              {customers.loading && !customers.data ? (
                <Skeleton className='h-9 w-full' />
              ) : (
                <Select
                  items={customerItems}
                  value={field.value}
                  onValueChange={(value) => {
                    if (value) field.onChange(value);
                  }}
                >
                  <SelectTrigger
                    ref={field.ref}
                    id={`${formId}-customer`}
                    className='w-full'
                    aria-required='true'
                    aria-invalid={fieldState.invalid}
                    onBlur={field.onBlur}
                  >
                    <SelectValue
                      placeholder={t('crm.contact.form.customerPlaceholder')}
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
              )}
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
