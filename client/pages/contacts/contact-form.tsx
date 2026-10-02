import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  createContact,
  updateContact,
  validationField,
} from '@/components/crm/crm-api.js';
import type { Contact } from '@/components/crm/types.js';
import { useCustomerOptions } from '@/components/crm/use-customer-options.js';
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

export interface ContactFormProps {
  /** When editing, the latest record, just loaded; omit it when creating. */
  readonly contact?: Contact;
  /** The `<form>` id; the container links its submit button through it. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSubmitted: (contact: Contact) => void;
  /** Receives `true` when submission starts and `false` when it ends. */
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
  const {
    customers,
    loading: customersLoading,
    error: customersError,
  } = useCustomerOptions();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('crm.form.nameRequired'))
          .max(128, t('crm.form.nameTooLong', { max: 128 })),
        contact: z
          .string()
          .trim()
          .max(255, t('crm.form.contactTooLong', { max: 255 })),
        customerId: z.string().min(1, t('crm.form.customerRequired')),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: contact?.name ?? '',
      contact: contact?.contact ?? '',
      customerId: contact ? String(contact.customerId) : '',
    },
  });

  const customerItems = customers.map((customer) => ({
    value: String(customer.id),
    label: customer.name,
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const input = {
      name: values.name,
      contact: values.contact || null,
      customerId: Number(values.customerId),
    };
    let saved: Contact;
    onSubmittingChange?.(true);
    try {
      saved = contact
        ? await updateContact(api, contact.id, input)
        : await createContact(api, input);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      const field = validationField(error);
      if (field === 'name' || field === 'contact' || field === 'customerId') {
        form.setError(
          field,
          { message: t('crm.error.validation') },
          {
            shouldFocus: true,
          },
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
    toaster.show({
      type: 'success',
      title: contact
        ? t('crm.contact.editSuccess', { name: saved.name })
        : t('crm.contact.createSuccess', { name: saved.name }),
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
        {customersError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{t('crm.error.optionsFailed')}</AlertDescription>
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
          name='contact'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-contact`}>
                {t('crm.contact.fields.contact')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-contact`}
                autoComplete='off'
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                {t('crm.contact.fields.contactHint')}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='customerId'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-customerId`}>
                {t('crm.customer.fields.single')}
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
                disabled={customersLoading}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-customerId`}
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
      </FieldGroup>
    </form>
  );
}
