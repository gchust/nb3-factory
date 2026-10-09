import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { createDocument, updateDocument } from './document-api.js';
import type { LibraryDocument } from './types.js';

const BODY_MAX = 20000;

export interface DocumentFormProps {
  readonly formId: string;
  /** Present when editing; omitted when creating. */
  readonly document?: LibraryDocument;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: (document: LibraryDocument) => void;
  readonly onNotFound?: () => void;
}

/**
 * The create and edit form. It renders no buttons: the container puts the
 * submit button outside the `<form>` and links it through `formId`. The
 * container is responsible for loading the latest record before rendering
 * this with `document` set.
 */
export function DocumentForm({
  formId,
  document,
  onSubmittingChange,
  onSubmitted,
  onNotFound,
}: DocumentFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  // Validation messages must be translated, and `t` only exists inside a
  // component, so the schema is built here and follows the language.
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
          .max(BODY_MAX, t('library.form.bodyTooLong', { max: BODY_MAX })),
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

  async function submit(values: z.infer<typeof schema>): Promise<void> {
    const changes = {
      title: values.title,
      body: values.body === '' ? null : values.body,
      published: values.published,
      confidential: values.confidential,
    };
    onSubmittingChange(true);
    try {
      const saved = document
        ? await updateDocument(api, document.id, changes)
        : await createDocument(api, changes);
      toaster.show({
        type: 'success',
        title: t(
          document ? 'library.update.success' : 'library.create.success',
          { title: saved.title },
        ),
      });
      // Report "not submitting" before the container closes the dialog, so
      // `beforeClose` reads the cleared ref and lets the close through.
      onSubmittingChange(false);
      onSubmitted(saved);
    } catch (caught: unknown) {
      onSubmittingChange(false);
      if (
        caught instanceof ApiClientError &&
        caught.status === 404 &&
        onNotFound
      ) {
        // The record was deleted while the dialog was open.
        onNotFound();
        return;
      }
      if (caught instanceof ApiClientError && caught.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
        return;
      }
      // Never show the backend's raw message.
      form.setError('root', {
        message:
          caught instanceof ApiClientError && caught.status === 403
            ? t('library.error.forbidden')
            : t('library.error.requestFailed'),
      });
    }
  }

  const rootError = form.formState.errors.root;

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(event) => void form.handleSubmit(submit)(event)}
    >
      <FieldGroup>
        {rootError ? (
          rootError.type === 'sessionExpired' ? (
            <SessionExpiredAlert />
          ) : (
            <Alert variant='destructive'>
              <AlertCircleIcon />
              <AlertDescription>
                {rootError.message ?? t('library.error.requestFailed')}
              </AlertDescription>
            </Alert>
          )
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
          render={({ field, fieldState }) => (
            <Field orientation='horizontal' data-invalid={fieldState.invalid}>
              <FieldContent>
                <FieldLabel htmlFor={`${formId}-published`}>
                  {t('library.fields.published')}
                </FieldLabel>
                <FieldDescription>
                  {t('library.form.publishedHint')}
                </FieldDescription>
              </FieldContent>
              <Switch
                ref={field.ref}
                id={`${formId}-published`}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked)}
                onBlur={field.onBlur}
                aria-invalid={fieldState.invalid}
              />
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name='confidential'
          render={({ field, fieldState }) => (
            <Field orientation='horizontal' data-invalid={fieldState.invalid}>
              <FieldContent>
                <FieldLabel htmlFor={`${formId}-confidential`}>
                  {t('library.fields.confidential')}
                </FieldLabel>
                <FieldDescription>
                  {t('library.form.confidentialHint')}
                </FieldDescription>
              </FieldContent>
              <Switch
                ref={field.ref}
                id={`${formId}-confidential`}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked)}
                onBlur={field.onBlur}
                aria-invalid={fieldState.invalid}
              />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
