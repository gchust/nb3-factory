'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { endOfDay } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { AlertCircleIcon } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { DatePicker } from '#components/date-picker';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';

import type { Todo } from './types.js';

export interface TodosFormProps {
  readonly formId: string;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: (todo: Todo) => void;
}

/**
 * Creates a todo: a required title and a required deadline. The deadline is the end of the chosen day in the reader's
 * zone, so a todo due today only becomes overdue tomorrow.
 *
 * It renders no buttons — the dialog's footer submits it through `formId` — and no title of its own.
 */
export function TodosForm({
  formId,
  onSubmittingChange,
  onSubmitted,
}: TodosFormProps): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const toaster = useToaster();

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('todos.form.titleRequired'))
          .max(200, t('todos.form.titleTooLong', { max: 200 })),
        dueAt: z.date({ error: t('todos.form.dueAtRequired') }),
      }),
    [t],
  );
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: '', dueAt: undefined },
  });
  // One date-fns locale per language the application offers; add a line when you add a language.
  const dateLocale = locale.startsWith('zh') ? zhCN : enUS;
  const rootError = form.formState.errors.root?.message;

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(event) =>
        void form.handleSubmit(async (values) => {
          onSubmittingChange(true);
          try {
            const { data } = await api.request<
              { data: Todo },
              { title: string; dueAt: string }
            >({
              path: 'todos',
              method: 'POST',
              json: {
                title: values.title,
                dueAt: endOfDay(values.dueAt).toISOString(),
              },
            });
            onSubmittingChange(false);
            toaster.show({
              type: 'success',
              title: t('todos.create.success', { title: data.title }),
            });
            onSubmitted(data);
          } catch (error) {
            onSubmittingChange(false);
            form.setError('root', {
              message:
                error instanceof ApiClientError && error.status === 403
                  ? t('todos.error.forbidden')
                  : error instanceof ApiClientError && error.status === 401
                    ? t('todos.error.sessionExpired')
                    : t('todos.error.requestFailed'),
            });
          }
        })(event)
      }
    >
      {rootError ? (
        <Alert variant='destructive' className='mb-4'>
          <AlertCircleIcon />
          <AlertTitle>{t('todos.error.title')}</AlertTitle>
          <AlertDescription>{rootError}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Controller
          control={form.control}
          name='title'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-title`}>
                {t('todos.form.title')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-title`}
                maxLength={200}
                autoComplete='off'
                aria-invalid={fieldState.invalid}
                aria-required='true'
                placeholder={t('todos.form.titlePlaceholder')}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='dueAt'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-dueAt`}>
                {t('todos.form.dueAt')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              {/* The picker takes neither `ref` nor `aria-invalid`; the FieldError below it carries the error. */}
              <DatePicker
                id={`${formId}-dueAt`}
                value={field.value}
                onChange={field.onChange}
                locale={dateLocale}
                placeholder={t('datePicker.placeholder')}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
