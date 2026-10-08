import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import type { Document } from './types.js';

export interface DocumentFormProps {
  /** When editing, the latest record; omit it when creating. */
  readonly document?: Document;
  /** The `<form>` id; the submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSubmitted: (document: Document) => void;
  /** Receives `true` when submission starts and `false` when it ends. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
  /** Whether a field differs from its default value; the container guards closing with it. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The one form behind create and edit. The document's visibility flags are part
 * of the record, so they are fields here rather than actions.
 */
export function DocumentForm({
  document,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
  onDirtyChange,
}: DocumentFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  // The schema lives in the component so its messages follow the current language.
  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('library.form.titleRequired'))
          .max(255, t('library.form.titleTooLong', { max: 255 })),
        body: z
          .string()
          .max(100_000, t('library.form.bodyTooLong', { max: 100_000 })),
        published: z.boolean(),
        confidential: z.boolean(),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: document?.title ?? '',
      body: document?.body ?? '',
      published: document?.published ?? false,
      confidential: document?.confidential ?? false,
    },
  });

  const { isDirty } = form.formState;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      title: values.title,
      body: values.body ? values.body : null,
      published: values.published,
      confidential: values.confidential,
    };
    let saved: Document;
    onSubmittingChange?.(true);
    try {
      const result = document
        ? await api.request<{ data: Document }>({
            path: `documents/${encodeURIComponent(String(document.id))}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Document }>({
            path: 'documents',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
      } else if (document && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('library.error.forbidden')
              : t('library.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: document
        ? t('library.edit.success', { title: saved.title })
        : t('library.create.success', { title: saved.title }),
    });
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError?.type === 'sessionExpired' ? (
          <SessionExpiredAlert />
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
                {t('library.fields.title')}
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
          name='body'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-body`}>
                {t('library.fields.body')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-body`}
                rows={6}
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='published'
          render={({ field }) => (
            <Field orientation='horizontal'>
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                id={`${formId}-published`}
              />
              <FieldLabel htmlFor={`${formId}-published`}>
                {t('library.fields.published')}
              </FieldLabel>
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='confidential'
          render={({ field }) => (
            <Field orientation='horizontal'>
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                id={`${formId}-confidential`}
              />
              <FieldLabel htmlFor={`${formId}-confidential`}>
                {t('library.fields.confidential')}
              </FieldLabel>
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
