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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { createContact, errorFieldOf, updateContact } from './api.js';
import type { Contact } from './types.js';
import { useCustomerOptions } from './use-customer-options.js';

export interface ContactFormProps {
  readonly contact?: Contact;
  readonly formId: string;
  readonly onSubmitted: (contact: Contact) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  readonly onNotFound?: () => void;
  /** Preselects the customer when creating a contact from a customer's detail. */
  readonly defaultCustomerId?: number;
}

/** The create and edit form for a contact: name and owning customer are required. */
export function ContactForm({
  contact,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
  defaultCustomerId,
}: ContactFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { customers, loading: customersLoading } = useCustomerOptions();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('crm.form.nameRequired'))
          .max(255, t('crm.form.nameTooLong', { max: 255 })),
        phone: z
          .string()
          .trim()
          .max(64, t('crm.form.phoneTooLong', { max: 64 })),
        email: z
          .string()
          .trim()
          .max(255, t('crm.form.emailTooLong', { max: 255 })),
        customerId: z.string().min(1, t('crm.form.customerRequired')),
      }),
    [t],
  );

  const initialCustomerId = contact?.customerId ?? defaultCustomerId;
  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: contact?.name ?? '',
      phone: contact?.phone ?? '',
      email: contact?.email ?? '',
      customerId:
        initialCustomerId === undefined ? '' : String(initialCustomerId),
    },
  });

  const customerItems = useMemo(
    () =>
      customers.map((customer) => ({
        value: String(customer.id),
        label: customer.name,
      })),
    [customers],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    onSubmittingChange?.(true);
    let saved: Contact;
    try {
      const changes = {
        name: values.name,
        phone: values.phone === '' ? null : values.phone,
        email: values.email === '' ? null : values.email,
        customerId: Number(values.customerId),
      };
      saved = contact
        ? await updateContact(api, contact.id, changes)
        : await createContact(api, changes);
    } catch (error: unknown) {
      const field = errorFieldOf(error);
      if (field === 'name') {
        form.setError(
          'name',
          { message: t('crm.form.nameRequired') },
          { shouldFocus: true },
        );
      } else if (field === 'customerId') {
        form.setError(
          'customerId',
          { message: t('crm.form.customerRequired') },
          { shouldFocus: true },
        );
      } else if (
        contact &&
        error instanceof ApiClientError &&
        error.status === 404
      ) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            error instanceof ApiClientError && error.status === 403
              ? t('crm.error.forbidden')
              : t('crm.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: contact
        ? t('crm.contacts.edit.success', { name: saved.name })
        : t('crm.contacts.create.success', { name: saved.name }),
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
        {!customersLoading && customers.length === 0 ? (
          <Alert>
            <AlertCircleIcon />
            <AlertDescription>{t('crm.form.noCustomers')}</AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='name'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t('crm.fields.name')}
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
                {t('crm.fields.customer')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
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
                  <SelectValue />
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
          name='phone'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-phone`}>
                {t('crm.fields.phone')}
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
                {t('crm.fields.email')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-email`}
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
