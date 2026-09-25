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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

import type { CustomerMemo } from './types.js';

const CUSTOMER_NAME_MAX_LENGTH = 255;
const REMARK_MAX_LENGTH = 2000;

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

/** The form shared by the create and edit dialogs. It renders no buttons; the container owns them. */
export function CustomerMemoForm({
  memo,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: CustomerMemoFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  // The schema lives in the component so validation messages can be built with t and follow the current language.
  const schema = useMemo(
    () =>
      z.object({
        customerName: z
          .string()
          .trim()
          .min(1, t('customerMemos.form.customerNameRequired'))
          .max(
            CUSTOMER_NAME_MAX_LENGTH,
            t('customerMemos.form.customerNameTooLong', {
              max: CUSTOMER_NAME_MAX_LENGTH,
            }),
          ),
        remark: z
          .string()
          .trim()
          .max(
            REMARK_MAX_LENGTH,
            t('customerMemos.form.remarkTooLong', { max: REMARK_MAX_LENGTH }),
          ),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      customerName: memo?.customerName ?? '',
      remark: memo?.remark ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    // Empty optional text becomes null, matching the backend's convention.
    const json = {
      customerName: values.customerName,
      remark: values.remark || null,
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
        // The server rejected an empty name (the browser validation should have caught it first).
        form.setError(
          'customerName',
          { message: t('customerMemos.form.customerNameRequired') },
          { shouldFocus: true },
        );
      } else if (memo && apiError?.status === 404) {
        // The record has been deleted: let the caller explain and refresh the list.
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

    toast.add({
      type: 'success',
      title: memo
        ? t('customerMemos.edit.success', { name: saved.customerName })
        : t('customerMemos.create.success', { name: saved.customerName }),
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
          name='remark'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-remark`}>
                {t('customerMemos.fields.remark')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-remark`}
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
