import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';

import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';

import type { DocumentInput } from './api.js';

export interface DocumentFormProps {
  readonly initial?: DocumentInput;
  readonly submitLabel: string;
  readonly busyLabel: string;
  readonly onCancel: () => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  readonly onSubmit: (input: DocumentInput) => Promise<void>;
  readonly error?: ReactElement;
}

/** The shared create/edit form; it only owns its fields and the submission state. */
export function DocumentForm({
  busyLabel,
  error,
  initial,
  onCancel,
  onSubmit,
  onSubmittingChange,
  submitLabel,
}: DocumentFormProps): ReactElement {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [published, setPublished] = useState(initial?.published ?? false);
  const [confidential, setConfidential] = useState(
    initial?.confidential ?? false,
  );
  const [submitting, setSubmitting] = useState(false);

  const updateSubmitting = (value: boolean): void => {
    setSubmitting(value);
    onSubmittingChange?.(value);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !content.trim() || submitting) return;
    updateSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), content, published, confidential });
    } finally {
      updateSubmitting(false);
    }
  };

  return (
    <form
      className='flex flex-col gap-5'
      onSubmit={(event) => void submit(event)}
    >
      <div className='flex flex-col gap-2'>
        <Label htmlFor='document-title'>{t('documents.form.title')}</Label>
        <Input
          id='document-title'
          value={title}
          maxLength={200}
          required
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='document-content'>{t('documents.form.content')}</Label>
        <Textarea
          id='document-content'
          value={content}
          required
          rows={10}
          onChange={(event) => setContent(event.target.value)}
        />
      </div>
      <div className='flex items-start justify-between gap-4 rounded-lg border border-border p-4'>
        <div className='flex flex-col gap-1'>
          <Label htmlFor='document-published'>
            {t('documents.form.published')}
          </Label>
          <p className='text-sm text-muted-foreground'>
            {t('documents.form.publishedHint')}
          </p>
        </div>
        <Switch
          id='document-published'
          checked={published}
          onCheckedChange={setPublished}
        />
      </div>
      <div className='flex items-start justify-between gap-4 rounded-lg border border-border p-4'>
        <div className='flex flex-col gap-1'>
          <Label htmlFor='document-confidential'>
            {t('documents.form.confidential')}
          </Label>
          <p className='text-sm text-muted-foreground'>
            {t('documents.form.confidentialHint')}
          </p>
        </div>
        <Switch
          id='document-confidential'
          checked={confidential}
          onCheckedChange={setConfidential}
        />
      </div>
      {error}
      <div className='flex items-center justify-end gap-2 border-t border-border pt-4'>
        <Button
          type='button'
          variant='outline'
          disabled={submitting}
          onClick={onCancel}
        >
          {t('documents.form.cancel')}
        </Button>
        <Button type='submit' disabled={submitting}>
          {submitting ? busyLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
