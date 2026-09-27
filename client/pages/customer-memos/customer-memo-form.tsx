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

const MAX_CUSTOMER_NAME_LENGTH = 200;
const MAX_NOTE_LENGTH = 2000;

export interface CustomerMemoFormProps {
  /** When editing, the current record; omit it to create a new memo. */
  readonly memo?: CustomerMemo;
  /** The `<form>` id, used by the submit button that sits outside the form. */
  readonly formId: string;
  /** Called with the saved record after the success toast. */
  readonly onSubmitted: (memo: CustomerMemo) => void;
  /** Reports whether a submission is in flight, so the container can disable its buttons. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** The edited memo was deleted by someone else (the endpoint answered 404). */
  readonly onNotFound?: () => void;
}

/**
 * One form for creating and editing a memo. The customer name is required and
 * whitespace-only input is rejected before any request is sent.
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

  const schema = useMemo(
    () =>
      z.object({
        customerName: z
          .string()
          .trim()
          .min(1, t('customerMemos.form.nameRequired'))
          .max(
            MAX_CUSTOMER_NAME_LENGTH,
            t('customerMemos.form.nameTooLong', {
              max: MAX_CUSTOMER_NAME_LENGTH,
            }),
          ),
        note: z
          .string()
          .trim()
          .max(
            MAX_NOTE_LENGTH,
            t('customerMemos.form.noteTooLong', { max: MAX_NOTE_LENGTH }),
          ),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      customerName: memo?.customerName ?? '',
      note: memo?.note ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      customerName: values.customerName,
      note: values.note || null,
    };
    onSubmittingChange?.(true);
    let saved: CustomerMemo;
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
        apiError?.status === 400 &&
        apiError.code === 'CUSTOMER_MEMO_NAME_REQUIRED'
      ) {
        // The server enforces the same rule as the schema: point at the field.
        form.setError(
          'customerName',
          { message: t('customerMemos.form.nameRequired') },
          { shouldFocus: true },
        );
      } else if (memo && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message: t('customerMemos.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toast.add({
      type: 'success',
      title: memo
        ? t('customerMemos.edit.success')
        : t('customerMemos.create.success'),
    });
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root?.message;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup className='py-4'>
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
          name='note'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-note`}>
                {t('customerMemos.fields.note')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-note`}
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
