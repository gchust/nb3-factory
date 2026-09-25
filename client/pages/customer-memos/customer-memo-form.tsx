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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import type { CustomerMemo } from './types.js';

/** Matches the server's own limits, so the two never disagree about what is too long. */
const MAX_CUSTOMER_NAME_LENGTH = 255;
const MAX_NOTES_LENGTH = 2000;

export interface CustomerMemoFormProps {
  /** When editing, the latest record, just loaded; omit it when creating. */
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

/** The form shared by create and edit. It renders fields only; the buttons live in the container's footer. */
export function CustomerMemoForm({
  memo,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: CustomerMemoFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const schema = useMemo(
    () =>
      z.object({
        customerName: z
          .string()
          .trim()
          .min(1, t('customerMemos.form.customerNameRequired'))
          .max(
            MAX_CUSTOMER_NAME_LENGTH,
            t('customerMemos.form.customerNameTooLong', {
              max: MAX_CUSTOMER_NAME_LENGTH,
            }),
          ),
        notes: z
          .string()
          .trim()
          .max(
            MAX_NOTES_LENGTH,
            t('customerMemos.form.notesTooLong', { max: MAX_NOTES_LENGTH }),
          ),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      customerName: memo?.customerName ?? '',
      notes: memo?.notes ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      customerName: values.customerName,
      notes: values.notes || null,
    };
    let saved: CustomerMemo;
    onSubmittingChange?.(true);
    try {
      const result = memo
        ? await api.request<{ data: CustomerMemo }>({
            path: `customer-memos/${memo.id}`,
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
      if (
        apiError?.status === 422 &&
        apiError.code === 'CUSTOMER_NAME_REQUIRED'
      ) {
        form.setError(
          'customerName',
          { message: t('customerMemos.form.customerNameRequired') },
          { shouldFocus: true },
        );
      } else if (
        apiError?.status === 422 &&
        apiError.code === 'CUSTOMER_NAME_TOO_LONG'
      ) {
        form.setError(
          'customerName',
          {
            message: t('customerMemos.form.customerNameTooLong', {
              max: MAX_CUSTOMER_NAME_LENGTH,
            }),
          },
          { shouldFocus: true },
        );
      } else if (
        apiError?.status === 422 &&
        apiError.code === 'NOTES_TOO_LONG'
      ) {
        form.setError(
          'notes',
          {
            message: t('customerMemos.form.notesTooLong', {
              max: MAX_NOTES_LENGTH,
            }),
          },
          { shouldFocus: true },
        );
      } else if (memo && apiError?.status === 404) {
        // The record has been deleted: let the caller explain and refresh the list, so the user does not submit again.
        onNotFound?.();
      } else {
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
        ? t('customerMemos.edit.success', { name: saved.customerName })
        : t('customerMemos.create.success', { name: saved.customerName }),
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
          name='customerName'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-customer-name`}>
                {t('customerMemos.fields.customerName')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-customer-name`}
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
