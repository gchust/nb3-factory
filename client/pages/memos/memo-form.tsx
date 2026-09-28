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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

import { createMemo, updateMemo } from './memo-api.js';
import type { CustomerMemo, CustomerMemoInput } from './types.js';

const NAME_MAX_LENGTH = 128;
const NOTE_MAX_LENGTH = 2000;

export interface MemoFormProps {
  /** When editing, the latest memo that was just loaded; omitted when creating. */
  readonly memo?: CustomerMemo;
  /** The id of the `<form>`. When the submit button is outside the form, the button sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the memo the endpoint returned. The form has already shown the success message. */
  readonly onSubmitted: (memo: CustomerMemo) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** The endpoint returned 404 while editing: the memo has been deleted. */
  readonly onNotFound?: () => void;
}

/** The form shared by creating and editing a customer memo. It renders fields and no buttons. */
export function MemoForm({
  memo,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: MemoFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  // The schema lives in the component so its messages follow the current language.
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('memos.form.nameRequired'))
          .max(
            NAME_MAX_LENGTH,
            t('memos.form.nameTooLong', { max: NAME_MAX_LENGTH }),
          ),
        note: z
          .string()
          .trim()
          .max(
            NOTE_MAX_LENGTH,
            t('memos.form.noteTooLong', { max: NOTE_MAX_LENGTH }),
          ),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: memo?.name ?? '',
      note: memo?.note ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    // Empty optional text becomes null so the column stays clean.
    const input: CustomerMemoInput = {
      name: values.name,
      note: values.note || null,
    };
    let saved: CustomerMemo;
    onSubmittingChange?.(true);
    try {
      saved =
        memo !== undefined
          ? await updateMemo(api, memo.id, input)
          : await createMemo(api, input);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (memo !== undefined && apiError?.status === 404) {
        // The memo was deleted by someone else: let the caller explain and refresh the list.
        onNotFound?.();
      } else if (
        apiError?.status === 400 &&
        apiError.code === 'NAME_REQUIRED'
      ) {
        form.setError(
          'name',
          { message: t('memos.form.nameRequired') },
          { shouldFocus: true },
        );
      } else if (
        apiError?.status === 400 &&
        apiError.code === 'NAME_TOO_LONG'
      ) {
        form.setError(
          'name',
          { message: t('memos.form.nameTooLong', { max: NAME_MAX_LENGTH }) },
          { shouldFocus: true },
        );
      } else if (
        apiError?.status === 400 &&
        apiError.code === 'NOTE_TOO_LONG'
      ) {
        form.setError('note', {
          message: t('memos.form.noteTooLong', { max: NOTE_MAX_LENGTH }),
        });
      } else {
        // Never surface the backend's raw message.
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('memos.error.forbidden')
              : t('memos.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toast.add({
      type: 'success',
      title: memo
        ? t('memos.edit.success', { name: saved.name })
        : t('memos.create.success', { name: saved.name }),
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
                {t('memos.fields.name')}
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
                placeholder={t('memos.form.namePlaceholder')}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='note'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-note`}>
                {t('memos.fields.note')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-note`}
                rows={5}
                aria-invalid={fieldState.invalid}
                placeholder={t('memos.form.notePlaceholder')}
              />
              <FieldDescription>
                {t('memos.form.noteHint', { max: NOTE_MAX_LENGTH })}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
