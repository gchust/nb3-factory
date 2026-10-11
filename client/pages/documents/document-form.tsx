import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react';

import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertDescription } from '#components/ui/alert';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';
import { DocumentsClient, type DocumentItem } from '#lib/documents-client';

const TITLE_MAX = 255;

export interface DocumentFormProps {
  /** When editing, the record as it was just loaded; omit it when creating. */
  readonly document?: DocumentItem;
  /** The `<form>` id; the submit button lives in the overlay footer and links back through it. */
  readonly formId: string;
  /** The save succeeded; the form has already shown the success message, so the caller must not show another. */
  readonly onSubmitted: (document: DocumentItem) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint answered 404: the record is already gone. */
  readonly onNotFound?: () => void;
  /** Whether any field differs from its loaded value; the container asks before closing with unsaved changes. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The fields of a document, shared by the create dialog and the edit dialog. It renders no buttons: both containers
 * put the submit button in the overlay footer, outside the `<form>`, and link it through `formId`.
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

  const initialTitle = document?.title ?? '';
  const initialBody = document?.body ?? '';
  const initialPublished = document?.published ?? false;
  const initialConfidential = document?.confidential ?? false;

  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [published, setPublished] = useState(initialPublished);
  const [confidential, setConfidential] = useState(initialConfidential);
  const [titleError, setTitleError] = useState<string>();
  const [rootError, setRootError] = useState<string>();
  const [sessionExpired, setSessionExpired] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const dirty =
    title !== initialTitle ||
    body !== initialBody ||
    published !== initialPublished ||
    confidential !== initialConfidential;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setRootError(undefined);
    setSessionExpired(false);

    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError(t('documents.form.titleRequired'));
      titleInputRef.current?.focus();
      return;
    }
    if (trimmed.length > TITLE_MAX) {
      setTitleError(t('documents.form.titleTooLong', { max: TITLE_MAX }));
      titleInputRef.current?.focus();
      return;
    }
    setTitleError(undefined);

    const values = {
      title: trimmed,
      body: body.trim() ? body : null,
      published,
      confidential,
    };

    onSubmittingChange?.(true);
    let saved: DocumentItem;
    try {
      const client = new DocumentsClient(api);
      saved = document
        ? await client.update(document.id, values)
        : await client.create(values);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        // The session ended: keep what was typed and let the person choose to sign in again.
        setSessionExpired(true);
      } else if (document && apiError?.status === 404) {
        onNotFound?.();
      } else if (apiError?.status === 403) {
        setRootError(t('documents.error.forbidden'));
      } else {
        setRootError(t('documents.error.requestFailed'));
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }

    toaster.show({
      type: 'success',
      title: document
        ? t('documents.edit.success', { name: saved.title })
        : t('documents.create.success', { name: saved.title }),
    });
    onSubmitted(saved);
  };

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {sessionExpired ? (
          <SessionExpiredAlert />
        ) : rootError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{rootError}</AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={Boolean(titleError)}>
          <FieldLabel htmlFor={`${formId}-title`}>
            {t('documents.fields.title')}
            <span aria-hidden='true' className='text-destructive'>
              *
            </span>
          </FieldLabel>
          <Input
            ref={titleInputRef}
            id={`${formId}-title`}
            value={title}
            autoComplete='off'
            aria-required='true'
            aria-invalid={Boolean(titleError)}
            onChange={(event) => setTitle(event.target.value)}
          />
          <FieldError errors={titleError ? [{ message: titleError }] : []} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-body`}>
            {t('documents.fields.body')}
          </FieldLabel>
          <Textarea
            id={`${formId}-body`}
            value={body}
            rows={6}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <Field orientation='horizontal'>
          <FieldLabel htmlFor={`${formId}-published`}>
            {t('documents.fields.published')}
          </FieldLabel>
          <Switch
            id={`${formId}-published`}
            checked={published}
            onCheckedChange={(checked) => setPublished(checked)}
          />
          <FieldDescription>
            {t('documents.form.publishedHint')}
          </FieldDescription>
        </Field>
        <Field orientation='horizontal'>
          <FieldLabel htmlFor={`${formId}-confidential`}>
            {t('documents.fields.confidential')}
          </FieldLabel>
          <Switch
            id={`${formId}-confidential`}
            checked={confidential}
            onCheckedChange={(checked) => setConfidential(checked)}
          />
          <FieldDescription>
            {t('documents.form.confidentialHint')}
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
