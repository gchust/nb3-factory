import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '#components/ui/alert';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group';
import { Textarea } from '#components/ui/textarea';

import { createDocument, updateDocument } from './document-api.js';
import type { DocumentChanges, LibraryDocument } from './types.js';

interface DocumentFormValues {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

export interface DocumentFormProps {
  /** Pass the record to edit; omit it to create. */
  readonly document?: LibraryDocument;
  readonly formId: string;
  readonly onSubmitted: (document: LibraryDocument) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** Editing an endpoint that answered 404: the document is gone. */
  readonly onNotFound?: () => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

/** The document's fields. Renders no buttons: the container links its submit button through `formId`. */
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

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('documents.error.titleRequired'))
          .max(255),
        body: z.string(),
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
    const changes: DocumentChanges = {
      title: values.title,
      body: values.body.trim() === '' ? null : values.body,
      published: values.published,
      confidential: values.confidential,
    };
    let saved: LibraryDocument;
    onSubmittingChange?.(true);
    try {
      saved = document
        ? await updateDocument(api, document.id, changes)
        : await createDocument(api, changes);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (document && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('documents.error.forbidden')
              : t('documents.error.save'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({ type: 'success', title: t('documents.saved') });
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError ? (
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
                {t('documents.field.title')}
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
                {t('documents.field.body')}
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
        <BooleanField
          control={form.control}
          name='published'
          formId={formId}
          label={t('documents.field.published')}
          description={t('documents.visibility.published')}
        />
        <BooleanField
          control={form.control}
          name='confidential'
          formId={formId}
          label={t('documents.field.confidential')}
          description={t('documents.visibility.confidential')}
        />
      </FieldGroup>
    </form>
  );
}

function BooleanField({
  control,
  name,
  formId,
  label,
  description,
}: {
  readonly control: Control<DocumentFormValues>;
  readonly name: 'published' | 'confidential';
  readonly formId: string;
  readonly label: string;
  readonly description: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field>
          <FieldLabel>{label}</FieldLabel>
          <RadioGroup
            value={field.value ? 'yes' : 'no'}
            onValueChange={(value) => field.onChange(value === 'yes')}
          >
            <FieldLabel htmlFor={`${formId}-${name}-yes`}>
              <RadioGroupItem id={`${formId}-${name}-yes`} value='yes' />
              {t('documents.yes')}
            </FieldLabel>
            <FieldLabel htmlFor={`${formId}-${name}-no`}>
              <RadioGroupItem id={`${formId}-${name}-no`} value='no' />
              {t('documents.no')}
            </FieldLabel>
          </RadioGroup>
          <FieldDescription>{description}</FieldDescription>
        </Field>
      )}
    />
  );
}
