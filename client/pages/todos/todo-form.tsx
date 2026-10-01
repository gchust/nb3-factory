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
import { Textarea } from '@/components/ui/textarea';

import type { Todo } from './types.js';

const TITLE_MAX_LENGTH = 255;
const NOTES_MAX_LENGTH = 2000;

export interface TodoFormProps {
  /** When editing, the latest record; omit it when creating. */
  readonly todo?: Todo;
  /** The `<form>` id; a submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** The save succeeded; the argument is the record the endpoint returned. */
  readonly onSubmitted: (todo: Todo) => void;
  /** `true` when submission starts, `false` when it ends. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404. */
  readonly onNotFound?: () => void;
}

/** The create and edit form for a todo, shared by both child routes. */
export function TodoForm({
  todo,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: TodoFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('todos.form.titleRequired'))
          .max(
            TITLE_MAX_LENGTH,
            t('todos.form.titleTooLong', { max: TITLE_MAX_LENGTH }),
          ),
        notes: z
          .string()
          .trim()
          .max(
            NOTES_MAX_LENGTH,
            t('todos.form.notesTooLong', { max: NOTES_MAX_LENGTH }),
          ),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      title: todo?.title ?? '',
      notes: todo?.notes ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    // Empty optional text becomes null, matching the endpoint's convention.
    const json = { title: values.title, notes: values.notes || null };
    let saved: Todo;
    onSubmittingChange?.(true);
    try {
      const result = todo
        ? await api.request<{ data: Todo }>({
            path: `todos/${todo.id}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Todo }>({
            path: 'todos',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (todo && apiError?.status === 404) {
        // The record has been deleted: let the container explain and refresh the list.
        onNotFound?.();
      } else {
        // Other errors appear at the top of the form, without the raw message the backend returned.
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('todos.error.forbidden')
              : t('todos.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: todo
        ? t('todos.edit.success', { title: saved.title })
        : t('todos.create.success', { title: saved.title }),
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
          name='title'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-title`}>
                {t('todos.fields.title')}
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
          name='notes'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-notes`}>
                {t('todos.fields.notes')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-notes`}
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
