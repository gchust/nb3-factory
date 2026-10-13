import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Textarea } from '#components/ui/textarea';

import { createDocument, updateDocument } from './api.js';
import type { DocumentSummary } from './types.js';

const BOOLEAN_OPTIONS = ['yes', 'no'] as const;

/** Renders a boolean column as the form's `yes`/`no` choice, keeping the literal type Zod's enum expects. */
function booleanOption(value: boolean | undefined): 'yes' | 'no' {
  return value ? 'yes' : 'no';
}

export interface DocumentFormProps {
  /** The document being edited; omit it when creating. */
  readonly document?: DocumentSummary;
  /** The `<form>` id. A submit button outside the form links to it with `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the document the endpoint returned. */
  readonly onSubmitted: (document: DocumentSummary) => void;
  /** Receives `true` when submission starts and `false` when it ends. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** Editing only: the endpoint answered 404 because the document is gone. */
  readonly onNotFound?: () => void;
  /** Receives `true` once a field differs from its initial value. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The fields of a document, shared by the create and edit dialogs.
 *
 * It renders no buttons: the dialog puts the submit button in its footer, outside the `<form>`, and links it through
 * `formId`. The owner is never a field — it is the person who creates the document.
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

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('library.form.titleRequired'))
          .max(255, t('library.form.titleTooLong', { max: 255 })),
        body: z.string(),
        published: z.enum(BOOLEAN_OPTIONS),
        confidential: z.enum(BOOLEAN_OPTIONS),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: document?.title ?? '',
      body: document?.body ?? '',
      published: booleanOption(document?.published),
      confidential: booleanOption(document?.confidential),
    },
  });

  const { isDirty } = form.formState;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const booleanItems = BOOLEAN_OPTIONS.map((value) => ({
    value,
    label: value === 'yes' ? t('library.form.yes') : t('library.form.no'),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const input = {
      title: values.title,
      body: values.body,
      published: values.published === 'yes',
      confidential: values.confidential === 'yes',
    };
    let saved: DocumentSummary;
    onSubmittingChange?.(true);
    try {
      saved = document
        ? await updateDocument(api, document.id, input)
        : await createDocument(api, input);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (document && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('library.form.forbidden')
              : t('library.form.saveFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: document
        ? t('library.form.updated', { title: saved.title })
        : t('library.form.created', { title: saved.title }),
    });
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
                {t('library.form.title')}
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
                {t('library.form.body')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-body`}
                className='min-h-32'
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
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-published`}>
                {t('library.form.published')}
              </FieldLabel>
              <Select
                items={booleanItems}
                value={field.value}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-published`}
                  className='w-full'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {booleanItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {t('library.form.publishedHint')}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='confidential'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-confidential`}>
                {t('library.form.confidential')}
              </FieldLabel>
              <Select
                items={booleanItems}
                value={field.value}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-confidential`}
                  className='w-full'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {booleanItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {t('library.form.confidentialHint')}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
