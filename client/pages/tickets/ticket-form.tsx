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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { TICKET_CATEGORIES, type Ticket } from './types.js';

export interface TicketFormProps {
  /** The `<form>` id. The submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the success message. */
  readonly onSubmitted: (ticket: Ticket) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted` is called. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
}

/** Submits a new ticket. It renders no buttons: the dialog footer supplies them through `formId`. */
export function TicketForm({
  formId,
  onSubmitted,
  onSubmittingChange,
}: TicketFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  // The schema lives in the component so validation messages can be built with t and follow the current language.
  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('tickets.form.titleRequired'))
          .max(200, t('tickets.form.titleTooLong', { max: 200 })),
        category: z.enum(TICKET_CATEGORIES),
        description: z
          .string()
          .trim()
          .max(5000, t('tickets.form.descriptionTooLong', { max: 5000 })),
      }),
    [t],
  );

  // No generic: the types are inferred from zodResolver(schema).
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      category: 'computer' as const,
      description: '',
    },
  });

  const categoryItems = TICKET_CATEGORIES.map((value) => ({
    value,
    label: t(`tickets.category.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    // The endpoint rejects an empty description; omit the field instead of sending an empty one.
    const json: { title: string; category: string; description?: string } = {
      title: values.title,
      category: values.category,
    };
    if (values.description) json.description = values.description;
    let saved: Ticket;
    onSubmittingChange?.(true);
    try {
      const result = await api.request<{ data: Ticket }>({
        path: 'tickets',
        method: 'POST',
        json,
      });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        // The session ended. Keep the input and let the user choose to sign in again.
        form.setError('root', { type: 'sessionExpired' });
      } else {
        // Other errors appear at the top of the form, without the raw message the backend returned.
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('tickets.error.forbidden')
              : t('tickets.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: t('tickets.create.success', { title: saved.title }),
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
          name='title'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-title`}>
                {t('tickets.fields.title')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-title`}
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
          name='category'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-category`}>
                {t('tickets.fields.category')}
              </FieldLabel>
              <Select
                items={categoryItems}
                value={field.value}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-category`}
                  className='w-full'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {categoryItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='description'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-description`}>
                {t('tickets.fields.description')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-description`}
                rows={4}
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
