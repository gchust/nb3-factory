import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type FormEvent, type ReactElement, useRef, useState } from 'react';

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
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';

import type { LibraryDocumentInput } from './types.js';

export interface DocumentFormProps {
  /** The `<form>` id; a submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  readonly initial: LibraryDocumentInput;
  /** Saves the values; it rejects on failure, which the form shows and survives. */
  readonly onSave: (values: LibraryDocumentInput) => Promise<void>;
  /** Reports submission, so the overlay can disable its buttons and refuse to close. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
}

interface FieldErrors {
  title?: string;
  body?: string;
  /** A failure that belongs to no single field, shown in an Alert at the top. */
  root?: string;
}

/**
 * The create and edit form, shared by both overlay routes so the two look and
 * validate the same.
 *
 * It validates on submit rather than while typing (T3.3) and keeps whatever was
 * typed when the server refuses the save (T3.6). The submit button lives in the
 * overlay's footer, so the form holds the values and the overlay holds the
 * chrome.
 */
export function DocumentForm({
  formId,
  initial,
  onSave,
  onSubmittingChange,
}: DocumentFormProps): ReactElement {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [published, setPublished] = useState(initial.published);
  const [confidential, setConfidential] = useState(initial.confidential);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Once a submission failed, a field revalidates as it changes so its error
  // disappears as soon as it is corrected; before that, no error is shown.
  const [validated, setValidated] = useState(false);
  const submittingRef = useRef(false);

  const validate = (values: {
    readonly title: string;
    readonly body: string;
  }): FieldErrors => {
    const next: FieldErrors = {};
    const title = values.title.trim();
    if (!title) next.title = t('library.form.titleRequired');
    else if (title.length > 200)
      next.title = t('library.form.titleTooLong', { max: 200 });
    if (values.body.length > 200000)
      next.body = t('library.form.bodyTooLong', { max: 200000 });
    return next;
  };

  // After a failed submission the form revalidates as it changes, so an error
  // disappears once it is corrected; before that, nothing shows an error.
  const revalidate = (values: { title: string; body: string }): void => {
    if (validated) setErrors(validate(values));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = validate({ title, body });
    setErrors(found);
    setValidated(true);
    if (found.title || found.body) return;

    const values: LibraryDocumentInput = {
      title: title.trim(),
      body,
      published,
      confidential,
    };
    submittingRef.current = true;
    onSubmittingChange?.(true);
    onSave(values)
      .catch((cause: unknown) => {
        const status =
          cause instanceof ApiClientError ? cause.status : undefined;
        setErrors({
          root:
            status === 403
              ? t('library.form.forbidden')
              : t('library.form.submitFailed'),
        });
      })
      .finally(() => {
        submittingRef.current = false;
        onSubmittingChange?.(false);
      });
  };

  return (
    <form id={formId} noValidate onSubmit={onSubmit}>
      <FieldGroup>
        {errors.root ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{errors.root}</AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={Boolean(errors.title)}>
          <FieldLabel htmlFor={`${formId}-title`}>
            {t('library.form.title')}
            <span aria-hidden='true' className='text-destructive'>
              *
            </span>
          </FieldLabel>
          <Input
            id={`${formId}-title`}
            value={title}
            autoComplete='off'
            aria-required='true'
            aria-invalid={Boolean(errors.title)}
            onChange={(event) => {
              setTitle(event.target.value);
              revalidate({ title: event.target.value, body });
            }}
          />
          <FieldError
            errors={[errors.title ? { message: errors.title } : undefined]}
          />
        </Field>
        <Field data-invalid={Boolean(errors.body)}>
          <FieldLabel htmlFor={`${formId}-body`}>
            {t('library.form.body')}
          </FieldLabel>
          <Textarea
            id={`${formId}-body`}
            value={body}
            rows={8}
            aria-invalid={Boolean(errors.body)}
            onChange={(event) => {
              setBody(event.target.value);
              revalidate({ title, body: event.target.value });
            }}
          />
          <FieldError
            errors={[errors.body ? { message: errors.body } : undefined]}
          />
        </Field>
        <Field orientation='horizontal'>
          <Checkbox
            id={`${formId}-published`}
            checked={published}
            onCheckedChange={(checked) => setPublished(checked === true)}
          />
          <div className='flex flex-col gap-0.5'>
            <Label htmlFor={`${formId}-published`}>
              {t('library.form.published')}
            </Label>
            <FieldDescription>
              {t('library.form.publishedHint')}
            </FieldDescription>
          </div>
        </Field>
        <Field orientation='horizontal'>
          <Checkbox
            id={`${formId}-confidential`}
            checked={confidential}
            onCheckedChange={(checked) => setConfidential(checked === true)}
          />
          <div className='flex flex-col gap-0.5'>
            <Label htmlFor={`${formId}-confidential`}>
              {t('library.form.confidential')}
            </Label>
            <FieldDescription>
              {t('library.form.confidentialHint')}
            </FieldDescription>
          </div>
        </Field>
      </FieldGroup>
    </form>
  );
}
