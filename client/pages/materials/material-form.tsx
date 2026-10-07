import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { MaterialFields } from './material-fields.js';
import type { Material, MaterialContent } from './types.js';

export interface MaterialFormProps {
  readonly formId: string;
  readonly initial?: MaterialContent;
  readonly submit: (content: MaterialContent) => Promise<Material>;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: (material: Material) => void;
}

/** The create and edit body: two controlled fields, one submit, and nothing else. */
export function MaterialForm({
  formId,
  initial,
  submit,
  onSubmittingChange,
  onSubmitted,
}: MaterialFormProps): ReactElement {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const describeFailure = (caught: unknown): string => {
    if (caught instanceof ApiClientError) {
      if (caught.status === 403) return t('materials.form.forbidden');
      if (caught.status === 404) return t('materials.error.notFound');
      if (caught.status === 400) return t('materials.form.invalid');
    }
    return t('materials.error.requestFailed');
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const content = { title: title.trim(), body: body.trim() };
    if (!content.title || !content.body) {
      setError(t('materials.form.required'));
      return;
    }
    setSubmitting(true);
    onSubmittingChange(true);
    setError(undefined);
    try {
      onSubmitted(await submit(content));
    } catch (caught) {
      setError(describeFailure(caught));
    } finally {
      setSubmitting(false);
      onSubmittingChange(false);
    }
  };

  return (
    <form
      id={formId}
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <MaterialFields
        titleId={`${formId}-title`}
        bodyId={`${formId}-body`}
        title={title}
        body={body}
        onTitleChange={setTitle}
        onBodyChange={setBody}
        disabled={submitting}
        error={error}
      />
    </form>
  );
}
