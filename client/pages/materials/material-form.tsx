import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from '@nocobase/i18n/client';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useMemo, type ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Material } from './types.js';

export interface MaterialFormProps {
  /** Prefixes every control id and links the dialog's footer submit button to this form. */
  readonly formId: string;
  /** Present when editing; the form loads nothing itself and is rendered only after the latest record arrived. */
  readonly material?: Material;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: (material: Material) => void;
  /** The record disappeared between loading and saving; the dialog explains and refreshes the list. */
  readonly onNotFound: () => void;
}

/** Create and edit share this form; a material is a title and a body. */
export function MaterialForm({
  formId,
  material,
  onSubmittingChange,
  onSubmitted,
  onNotFound,
}: MaterialFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('materials.form.titleRequired'))
          .max(200, t('materials.form.titleTooLong')),
        body: z
          .string()
          .trim()
          .min(1, t('materials.form.bodyRequired'))
          .max(20000, t('materials.form.bodyTooLong')),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: material?.title ?? '',
      body: material?.body ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    onSubmittingChange(true);
    try {
      if (material) {
        const { record } = await api
          .repository<Material>('materials')
          .updateOne({ filter: { id: material.id }, values });
        onSubmittingChange(false);
        onSubmitted(record);
      } else {
        const { record } = await api
          .repository<Material>('materials')
          .createOne({ values });
        onSubmittingChange(false);
        onSubmitted(record);
      }
    } catch (error) {
      onSubmittingChange(false);
      if (error instanceof ApiClientError && error.status === 404) {
        onNotFound();
        return;
      }
      form.setError('root', {
        message:
          error instanceof ApiClientError && error.status === 403
            ? t('materials.error.forbidden')
            : t('materials.error.requestFailed'),
      });
    }
  });

  const rootError = form.formState.errors.root?.message;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <div className='space-y-6'>
        {rootError ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('materials.error.title')}</AlertTitle>
            <AlertDescription>{rootError}</AlertDescription>
          </Alert>
        ) : null}

        <Controller
          control={form.control}
          name='title'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-title`}>
                {t('materials.form.title')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                aria-invalid={fieldState.invalid}
                aria-required='true'
                autoComplete='off'
                id={`${formId}-title`}
              />
              <FieldDescription>
                {t('materials.form.titleHint')}
              </FieldDescription>
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
                {t('materials.form.body')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Textarea
                {...field}
                aria-invalid={fieldState.invalid}
                aria-required='true'
                className='min-h-40'
                id={`${formId}-body`}
              />
              <FieldDescription>
                {t('materials.form.bodyHint')}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </div>
    </form>
  );
}
