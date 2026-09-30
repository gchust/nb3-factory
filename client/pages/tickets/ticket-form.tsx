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

import { TICKET_CATEGORIES, type Ticket } from './types.js';

export interface TicketFormProps {
  /** The `<form>` id; a submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the ticket the endpoint returned. The form has already shown the message. */
  readonly onSubmitted: (ticket: Ticket) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` before `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
}

/** Submitting a ticket: the fields an employee chooses, in one form. */
export function TicketForm({
  formId,
  onSubmitted,
  onSubmittingChange,
}: TicketFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('tickets.form.titleRequired'))
          .max(200, t('tickets.form.titleTooLong', { max: 200 })),
        category: z.enum(TICKET_CATEGORIES, {
          message: t('tickets.form.categoryRequired'),
        }),
        description: z
          .string()
          .trim()
          .max(5000, t('tickets.form.descriptionTooLong', { max: 5000 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      title: '',
      category: 'computer' as (typeof TICKET_CATEGORIES)[number],
      description: '',
    },
  });

  const categoryItems = TICKET_CATEGORIES.map((value) => ({
    value,
    label: t(`tickets.category.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    onSubmittingChange?.(true);
    let created: Ticket;
    try {
      const result = await api.request<{ data: Ticket }>({
        path: 'tickets',
        method: 'POST',
        json: {
          title: values.title,
          category: values.category,
          description: values.description || null,
        },
      });
      created = result.data;
    } catch (error: unknown) {
      // Other errors appear at the top of the form, without the raw message the backend returned.
      form.setError('root', {
        message:
          error instanceof ApiClientError && error.status === 403
            ? t('tickets.error.forbidden')
            : t('tickets.error.requestFailed'),
      });
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: t('tickets.create.success'),
    });
    onSubmitted(created);
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
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
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
                  aria-required='true'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryItems.map((item) => (
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
          name='description'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-description`}>
                {t('tickets.fields.description')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-description`}
                rows={5}
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
