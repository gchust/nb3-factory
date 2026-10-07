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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { createItTicket } from './it-ticket-api.js';
import { SessionExpiredNotice } from './session-expired-notice.js';
import { IT_TICKET_CATEGORIES, type ItTicket } from './types.js';

export interface ItTicketFormProps {
  /** The `<form>` id; the submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned; the form has already shown the success message. */
  readonly onSubmitted: (ticket: ItTicket) => void;
  /** Receives `true` when submission starts and `false` when it ends. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
}

/**
 * The submission form.
 *
 * It sends only what the employee owns: the title, the category and the
 * description. The status, the submitter and every timestamp are decided by the
 * server from the session, so there is no field for them here.
 */
export function ItTicketForm({
  formId,
  onSubmitted,
  onSubmittingChange,
}: ItTicketFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  // The schema lives in the component so its validation messages follow the
  // current language.
  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('itTickets.form.titleRequired'))
          .max(120, t('itTickets.form.titleTooLong', { max: 120 })),
        category: z.enum(IT_TICKET_CATEGORIES),
        description: z
          .string()
          .trim()
          .max(2000, t('itTickets.form.descriptionTooLong', { max: 2000 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      category: IT_TICKET_CATEGORIES[0],
      description: '',
    },
  });

  const categoryItems = IT_TICKET_CATEGORIES.map((value) => ({
    value,
    label: t(`itTickets.category.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    let saved: ItTicket;
    onSubmittingChange?.(true);
    try {
      saved = await createItTicket(api, {
        title: values.title,
        category: values.category,
        description: values.description ? values.description : null,
      });
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        // Keep what was typed and let the user choose to sign in again; the
        // notice below is what sends them there.
        form.setError('root', { type: 'sessionExpired' });
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('itTickets.error.forbidden')
              : t('itTickets.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: t('itTickets.create.success', { title: saved.title }),
    });
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError?.type === 'sessionExpired' ? (
          <SessionExpiredNotice />
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
                {t('itTickets.fields.title')}
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
                {t('itTickets.fields.category')}
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
                {t('itTickets.fields.description')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-description`}
                rows={4}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                {t('itTickets.form.descriptionHint')}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
