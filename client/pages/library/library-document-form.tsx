import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { createLibraryDocument, updateLibraryDocument } from './library-api.js';
import type { LibraryDocument, LibraryDocumentInput } from './types.js';

export interface LibraryDocumentFormProps {
  /** Ties the submit button in the dialog footer to this form. */
  readonly formId: string;
  /** The document to edit; omit it to create one. */
  readonly document?: LibraryDocument;
  /** Reports the in-flight state so the dialog can disable its buttons and guard closing. */
  readonly onSubmittingChange: (submitting: boolean) => void;
  /** Reports whether the form differs from what it loaded, for the "discard changes?" guard. */
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly onSubmitted: (document: LibraryDocument) => void;
  /** The record disappeared under the user (someone deleted it, or the grant was revoked). */
  readonly onNotFound: () => void;
}

function valuesOf(document?: LibraryDocument): LibraryDocumentInput {
  return {
    title: document?.title ?? '',
    content: document?.content ?? '',
    published: document?.published ?? false,
    confidential: document?.confidential ?? false,
  };
}

function normalize(values: LibraryDocumentInput): LibraryDocumentInput {
  const content = values.content?.trim() ? values.content : null;
  return {
    title: values.title.trim(),
    content,
    published: values.published,
    confidential: values.confidential,
  };
}

/**
 * The create/edit form shared by the create dialog and both edit routes. It is
 * a plain `<form>`; the overlay supplies the Cancel/Save footer and submits it
 * by id.
 */
export function LibraryDocumentForm({
  document,
  formId,
  onDirtyChange,
  onNotFound,
  onSubmitted,
  onSubmittingChange,
}: LibraryDocumentFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [values, setValues] = useState<LibraryDocumentInput>(() =>
    valuesOf(document),
  );
  const [error, setError] = useState<unknown>(undefined);
  const [titleTouched, setTitleTouched] = useState(false);

  const dirty = JSON.stringify(values) !== JSON.stringify(valuesOf(document));
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const titleMissing = values.title.trim() === '';

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setTitleTouched(true);
    const payload = normalize(values);
    if (!payload.title) return;
    setError(undefined);
    onSubmittingChange(true);
    try {
      const saved = document
        ? await updateLibraryDocument(api, document.id, payload)
        : await createLibraryDocument(api, payload);
      // Clear the in-flight state before handing off, so the dialog's close guard lets the overlay close.
      onSubmittingChange(false);
      onDirtyChange?.(false);
      onSubmitted(saved);
    } catch (caught) {
      onSubmittingChange(false);
      if (caught instanceof ApiClientError && caught.status === 404) {
        onNotFound();
        return;
      }
      setError(caught);
    }
  }

  return (
    <form id={formId} onSubmit={(event) => void handleSubmit(event)}>
      <FieldGroup>
        <Field data-invalid={titleTouched && titleMissing}>
          <FieldLabel htmlFor={`${formId}-title`}>
            {t('library.fields.title')}
          </FieldLabel>
          <Input
            autoFocus
            id={`${formId}-title`}
            maxLength={255}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            onBlur={() => setTitleTouched(true)}
            required
            value={values.title}
          />
          {titleTouched && titleMissing ? (
            <FieldError>{t('library.form.titleRequired')}</FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-content`}>
            {t('library.fields.content')}
          </FieldLabel>
          <Textarea
            id={`${formId}-content`}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                content: event.target.value,
              }))
            }
            rows={6}
            value={values.content ?? ''}
          />
        </Field>
        <Field orientation='horizontal'>
          <FieldLabel htmlFor={`${formId}-published`}>
            {t('library.fields.published')}
          </FieldLabel>
          <Switch
            checked={values.published}
            id={`${formId}-published`}
            onCheckedChange={(checked) =>
              setValues((current) => ({ ...current, published: checked }))
            }
          />
          <FieldDescription>
            {t('library.fields.publishedHint')}
          </FieldDescription>
        </Field>
        <Field orientation='horizontal'>
          <FieldLabel htmlFor={`${formId}-confidential`}>
            {t('library.fields.confidential')}
          </FieldLabel>
          <Switch
            checked={values.confidential}
            id={`${formId}-confidential`}
            onCheckedChange={(checked) =>
              setValues((current) => ({ ...current, confidential: checked }))
            }
          />
          <FieldDescription>
            {t('library.fields.confidentialHint')}
          </FieldDescription>
        </Field>
        {error !== undefined ? (
          <Alert role='alert' variant='destructive'>
            <AlertTitle>{t('library.form.errorTitle')}</AlertTitle>
            <AlertDescription>
              {error instanceof ApiClientError && error.status === 403
                ? t('library.form.forbidden')
                : t('library.form.requestFailed')}
            </AlertDescription>
          </Alert>
        ) : null}
      </FieldGroup>
    </form>
  );
}
