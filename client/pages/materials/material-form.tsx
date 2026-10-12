import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Checkbox } from '#components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';

import type { Material } from './types.js';

export interface MaterialFormProps {
  /** When editing, pass the latest record, just loaded; omit it when creating. */
  readonly material?: Material;
  /** The `<form>` id. When the submit button is outside the form, the button sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the success message. */
  readonly onSubmitted: (material: Material) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted` is called. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
}

export function MaterialForm({
  material,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: MaterialFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  // The schema lives in the component so validation messages can be built with t and follow the current language.
  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('materials.form.titleRequired'))
          .max(255, t('materials.form.titleTooLong', { max: 255 })),
        body: z
          .string()
          .max(10000, t('materials.form.bodyTooLong', { max: 10000 })),
        published: z.boolean(),
        confidential: z.boolean(),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: material?.title ?? '',
      body: material?.body ?? '',
      published: material?.published ?? false,
      confidential: material?.confidential ?? false,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    // values is the data after validation and trimming; empty optional text becomes null.
    const json = {
      title: values.title,
      body: values.body || null,
      published: values.published,
      confidential: values.confidential,
    };
    let saved: Material;
    onSubmittingChange?.(true);
    try {
      const result = material
        ? await api.request<{ data: Material }>({
            path: `materials/${encodeURIComponent(String(material.id))}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Material }>({
            path: 'materials',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        // The session ended. Keep the input and let the user choose to sign in again (SessionExpiredAlert below).
        form.setError('root', { type: 'sessionExpired' });
      } else if (material && apiError?.status === 404) {
        // The record has been deleted: let the caller explain and refresh the list, so the user does not submit again.
        onNotFound?.();
      } else {
        // Other errors appear at the top of the form, without the raw message the backend returned.
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('materials.error.forbidden')
              : t('materials.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: material
        ? t('materials.edit.success', { title: saved.title })
        : t('materials.create.success', { title: saved.title }),
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
                {t('materials.fields.title')}
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
                {t('materials.fields.body')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-body`}
                rows={8}
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
                id={`${formId}-published`}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked)}
              />
              <FieldLabel htmlFor={`${formId}-published`}>
                {t('materials.fields.published')}
              </FieldLabel>
              <FieldDescription>
                {t('materials.form.publishedHint')}
              </FieldDescription>
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='confidential'
          render={({ field }) => (
            <Field orientation='horizontal'>
              <Checkbox
                id={`${formId}-confidential`}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked)}
              />
              <FieldLabel htmlFor={`${formId}-confidential`}>
                {t('materials.fields.confidential')}
              </FieldLabel>
              <FieldDescription>
                {t('materials.form.confidentialHint')}
              </FieldDescription>
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
