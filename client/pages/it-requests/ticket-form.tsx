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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

import {
  IT_CATEGORY_LABEL_KEYS,
  IT_TICKET_CATEGORIES,
  type ItTicket,
  type ItTicketCategory,
} from './types.js';

/** The form only creates; handlers start from the create action on the list. */
export interface TicketFormProps {
  /** The `<form>` id; a submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the message. */
  readonly onSubmitted: (ticket: ItTicket) => void;
  /** Receives `true` when submission starts and `false` when it ends. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
}

export function TicketForm({
  formId,
  onSubmitted,
  onSubmittingChange,
}: TicketFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  // The schema lives in the component so validation messages follow the
  // current language. Limits mirror `server/it/rules.ts`.
  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('it.form.titleRequired'))
          .max(200, t('it.form.titleTooLong', { max: 200 })),
        category: z.enum(IT_TICKET_CATEGORIES),
        description: z
          .string()
          .trim()
          .max(2000, t('it.form.descriptionTooLong', { max: 2000 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      title: '',
      // Typed so the form's field type is the enum, matching the resolver.
      category: 'computer' as ItTicketCategory,
      description: '',
    },
  });

  const categoryItems = IT_TICKET_CATEGORIES.map((value) => ({
    value,
    label: t(IT_CATEGORY_LABEL_KEYS[value]),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    let saved: ItTicket;
    onSubmittingChange?.(true);
    try {
      const result = await api.request<{ data: ItTicket }>({
        path: 'it/tickets',
        method: 'POST',
        json: {
          title: values.title,
          category: values.category,
          description: values.description || null,
        },
      });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      form.setError('root', {
        message:
          apiError?.status === 403
            ? t('it.error.forbidden')
            : t('it.error.requestFailed'),
      });
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toast.add({ type: 'success', title: t('it.create.success') });
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
          name='title'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-title`}>
                {t('it.fields.title')}
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
                {t('it.fields.category')}
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
                {t('it.fields.description')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-description`}
                rows={5}
                placeholder={t('it.form.descriptionPlaceholder')}
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
