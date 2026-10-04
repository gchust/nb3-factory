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
  FieldDescription,
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

import {
  notifySalesDataChanged,
  salesErrorMessageKey,
  useCustomerOptions,
  type Contact,
} from '../shared';

export interface ContactFormProps {
  /** When editing, the latest record, just loaded; omit it when creating. */
  readonly contact?: Contact;
  /** The owning customer preselected when creating from a customer page. */
  readonly defaultCustomerId?: string;
  /** The `<form>` id; the footer's submit button is linked through it. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the toast. */
  readonly onSubmitted: (contact: Contact) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
}

/** The contact form shared by the create dialog (from the list or from a customer page) and the edit dialog. */
export function ContactForm({
  contact,
  defaultCustomerId,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: ContactFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { options: customerOptions, loading: customersLoading } =
    useCustomerOptions();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('sales.form.contactNameRequired'))
          .max(255, t('sales.form.nameTooLong', { max: 255 })),
        customerId: z.string().min(1, t('sales.form.contactCustomerRequired')),
        phone: z
          .string()
          .trim()
          .max(64, t('sales.form.phoneTooLong', { max: 64 })),
        email: z
          .string()
          .trim()
          .max(320, t('sales.form.emailTooLong', { max: 320 }))
          .refine(
            (value) => value === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
            t('sales.form.emailInvalid'),
          ),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: contact?.name ?? '',
      customerId: contact
        ? String(contact.customerId)
        : (defaultCustomerId ?? ''),
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
      const result = contact
        ? await api.request<{ data: Contact }>({
            path: `sales/contacts/${contact.id}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Contact }>({
            path: 'sales/contacts',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      if (contact && error instanceof ApiClientError && error.status === 404) {
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
      title: contact
        ? t('sales.contact.updateSuccess', { name: saved.name })
        : t('sales.contact.createSuccess', { name: saved.name }),
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
          name='customerId'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-customer`}>
                {t('sales.contact.customer')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Select
                value={field.value === '' ? null : field.value}
                onValueChange={(value) => field.onChange(value ?? '')}
              >
                <SelectTrigger
                  id={`${formId}-customer`}
                  className='w-full'
                  aria-required='true'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customerOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customersLoading ? (
                <FieldDescription>{t('sales.status.loading')}</FieldDescription>
              ) : null}
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
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
          name='phone'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-phone`}>
                {t('sales.contact.phone')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-phone`}
                type='tel'
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
                {t('sales.contact.email')}
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
