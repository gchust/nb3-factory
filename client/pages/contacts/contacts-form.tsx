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
import { Textarea } from '@/components/ui/textarea';

import {
  CONTACT_DEPARTMENTS,
  type Contact,
  type ContactInput,
} from './types.js';

export interface ContactFormProps {
  /** When editing, pass the loaded record; omit it when creating. */
  readonly contact?: Contact;
  /** The `<form>` id; a submit button outside the form links to it through `form`. */
  readonly formId: string;
  /** Called with the record the endpoint returned; the success toast is already shown. */
  readonly onSubmitted: (contact: Contact) => void;
  /** `true` when submission starts, `false` when it ends. On success, `false` precedes `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
}

/**
 * One form for creating and editing: passing `contact` sends `PATCH`, omitting
 * it sends `POST`. The form renders no buttons — the container puts them in the
 * dialog footer and links the submit button through `formId`.
 */
export function ContactForm({
  contact,
  formId,
  onSubmitted,
  onSubmittingChange,
}: ContactFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  // The schema lives in the component so validation messages follow the language.
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('contacts.form.nameRequired'))
          .max(100, t('contacts.form.nameTooLong', { max: 100 })),
        department: z.enum(CONTACT_DEPARTMENTS, {
          error: t('contacts.form.departmentRequired'),
        }),
        phone: z
          .string()
          .trim()
          .refine(
            (value) => value === '' || /^\d{11}$/u.test(value),
            t('contacts.form.phoneInvalid'),
          ),
        notes: z
          .string()
          .trim()
          .max(500, t('contacts.form.notesTooLong', { max: 500 })),
      }),
    [t],
  );

  // No generic: the types are inferred from zodResolver(schema).
  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: contact?.name ?? '',
      department: contact?.department ?? 'rd',
      phone: contact?.phone ?? '',
      notes: contact?.notes ?? '',
    },
  });

  const departmentItems = CONTACT_DEPARTMENTS.map((value) => ({
    value,
    label: t(`contacts.department.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const json: ContactInput = {
      name: values.name,
      department: values.department,
      phone: values.phone || null,
      notes: values.notes || null,
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
      form.setError('root', {
        message:
          apiError?.status === 400
            ? t('contacts.error.invalid')
            : t('contacts.error.requestFailed'),
      });
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
                {t('contacts.form.name')}
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
          name='department'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-department`}>
                {t('contacts.form.department')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Select
                items={departmentItems}
                value={field.value}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-department`}
                  className='w-full'
                  aria-required='true'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {departmentItems.map((item) => (
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
                {t('contacts.form.phone')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-phone`}
                inputMode='numeric'
                autoComplete='off'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='notes'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-notes`}>
                {t('contacts.form.notes')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-notes`}
                rows={3}
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
