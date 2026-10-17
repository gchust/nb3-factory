import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { enUS, zhCN } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '#components/ui/button';
import { Calendar } from '#components/ui/calendar';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';

import { useDateFormat } from '#hooks/use-date-format';

import { createTodo } from './api.js';
import type { Todo } from './types.js';

/** The default time of day a new todo is due, so the field starts with a sensible value instead of empty. */
const DEFAULT_TIME = '09:00';

const pad = (value: number): string => String(value).padStart(2, '0');

/** A `Date` as the `yyyy-MM-dd` a `<input type="date">` would produce, in the browser's own time zone. */
function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateValue(value: string): Date | undefined {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

/**
 * The day and the time of day as one instant. Both halves are read as local time, which is what the person picking
 * them sees, and stored as the instant the API and the expiry sweep compare against.
 */
function toInstant(dateValue: string, timeValue: string): string {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

/** Tomorrow morning: a due time in the near future, so a new todo does not start out already expired. */
function defaultDueDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

export interface TodoFormProps {
  readonly formId: string;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: (todo: Todo) => void;
}

/**
 * The create form. It renders no buttons: the dialog keeps them in its footer, outside the `<form>`, and links them
 * back with `formId`.
 */
export function TodoForm({
  formId,
  onSubmittingChange,
  onSubmitted,
}: TodoFormProps): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { formatDate } = useDateFormat();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const calendarLocale = i18n?.language.startsWith('zh') ? zhCN : enUS;

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('todos.form.titleRequired'))
          .max(200, t('todos.form.titleTooLong')),
        dueDate: z.string().min(1, t('todos.form.dueDateRequired')),
        // A time input always answers hh:mm; a hand-edited value that does not is caught here.
        dueTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/, t('todos.form.dueTimeRequired')),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      dueDate: toDateValue(defaultDueDate()),
      dueTime: DEFAULT_TIME,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    onSubmittingChange(true);
    try {
      const todo = await createTodo(api, {
        title: values.title,
        dueAt: toInstant(values.dueDate, values.dueTime),
      });
      void toaster.show({
        type: 'success',
        title: t('todos.create.success', { title: todo.title }),
      });
      onSubmittingChange(false);
      onSubmitted(todo);
    } catch (error) {
      onSubmittingChange(false);
      form.setError('root', {
        message:
          error instanceof ApiClientError && error.status === 403
            ? t('todos.create.forbidden')
            : t('todos.create.failed'),
      });
    }
  });

  const rootError = form.formState.errors.root?.message;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <div className='flex flex-col gap-5'>
        {rootError ? (
          <p
            role='alert'
            className='rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive'
          >
            {rootError}
          </p>
        ) : null}

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
                aria-invalid={fieldState.invalid}
                aria-required='true'
                autoComplete='off'
                placeholder={t('todos.form.titlePlaceholder')}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className='grid gap-4 sm:grid-cols-2'>
          <Controller
            control={form.control}
            name='dueDate'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-due-date`}>
                  {t('todos.form.dueDate')}
                  <span aria-hidden='true' className='text-destructive'>
                    *
                  </span>
                </FieldLabel>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        id={`${formId}-due-date`}
                        type='button'
                        variant='outline'
                        className='w-full justify-start font-normal'
                        aria-invalid={fieldState.invalid}
                      />
                    }
                  >
                    <CalendarIcon data-icon='inline-start' />
                    {parseDateValue(field.value)
                      ? formatDate(parseDateValue(field.value) as Date)
                      : t('todos.form.pickDate')}
                  </PopoverTrigger>
                  <PopoverContent align='start' className='w-auto p-0'>
                    <Calendar
                      mode='single'
                      locale={calendarLocale}
                      selected={parseDateValue(field.value)}
                      onSelect={(date) => {
                        if (!date) return;
                        field.onChange(toDateValue(date));
                        setCalendarOpen(false);
                      }}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name='dueTime'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-due-time`}>
                  {t('todos.form.dueTime')}
                  <span aria-hidden='true' className='text-destructive'>
                    *
                  </span>
                </FieldLabel>
                <Input
                  {...field}
                  id={`${formId}-due-time`}
                  type='time'
                  aria-invalid={fieldState.invalid}
                  aria-required='true'
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>

        <FieldDescription>{t('todos.form.dueHint')}</FieldDescription>
      </div>
    </form>
  );
}
