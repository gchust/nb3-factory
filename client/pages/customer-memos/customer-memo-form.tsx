import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';

import type { CustomerMemo } from './types.js';

const NAME_MAX_LENGTH = 255;
const NOTES_MAX_LENGTH = 2000;

export interface CustomerMemoFormProps {
  /** When editing, pass the latest record, just loaded; omit it when creating. */
  readonly memo?: CustomerMemo;
  /** The `<form>` id. When the submit button is outside the form, the button sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the success message. */
  readonly onSubmitted: (memo: CustomerMemo) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted` is called. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
}

/**
 * One form shared by create and edit. The customer name is required, so an
 * empty name fails validation and the form reports it under the field before
 * any request is sent; the notes are optional.
 */
export function CustomerMemoForm({
  memo,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: CustomerMemoFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  // The schema lives in the component so the validation messages can be built with t and follow the current language.
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('customerMemos.form.nameRequired'))
          .max(
            NAME_MAX_LENGTH,
            t('customerMemos.form.nameTooLong', { max: NAME_MAX_LENGTH }),
          ),
        notes: z
          .string()
          .trim()
          .max(
            NOTES_MAX_LENGTH,
            t('customerMemos.form.notesTooLong', { max: NOTES_MAX_LENGTH }),
          ),
      }),
    [t],
  );

  // No generic: the types are inferred from zodResolver(schema).
  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: memo?.name ?? '',
      notes: memo?.notes ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    // values is the data after validation and trimming; empty optional text becomes null.
    const json = { name: values.name, notes: values.notes || null };
    let saved: CustomerMemo;
    onSubmittingChange?.(true);
    try {
      const result = memo
        ? await api.request<{ data: CustomerMemo }>({
            path: `customer-memos/${encodeURIComponent(memo.id)}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: CustomerMemo }>({
            path: 'customer-memos',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (memo && apiError?.status === 404) {
        // The record has been deleted: let the caller explain and refresh the list, so the user does not submit again.
        onNotFound?.();
      } else {
        // Other errors appear at the top of the form, without the raw message the backend returned.
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('customerMemos.error.forbidden')
              : t('customerMemos.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toast.success(
      memo
        ? t('customerMemos.edit.success', { name: saved.name })
        : t('customerMemos.create.success', { name: saved.name }),
    );
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
                {t('customerMemos.fields.name')}
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
          name='notes'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-notes`}>
                {t('customerMemos.fields.notes')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-notes`}
                rows={4}
                placeholder={t('customerMemos.form.notesPlaceholder')}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                {t('customerMemos.form.notesDescription')}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
