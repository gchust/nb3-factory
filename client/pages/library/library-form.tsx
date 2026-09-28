/**
 * The create and edit form for a document.
 *
 * The same field set serves both flows; the caller supplies the starting
 * values and handles the submit. The form owns only its draft state, so a
 * failed request leaves what the user typed in place for another attempt.
 */
import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import type { LibraryDocumentInput } from './types.js';

const MAX_TITLE_LENGTH = 255;

export interface LibraryFormProps {
  /** The document being edited, or `null` when creating one. */
  readonly initial: LibraryDocumentInput | null;
  readonly isSubmitting: boolean;
  readonly onSubmit: (input: LibraryDocumentInput) => void;
  readonly onCancel: () => void;
}

export function LibraryForm({
  initial,
  isSubmitting,
  onSubmit,
  onCancel,
}: LibraryFormProps): ReactElement {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [published, setPublished] = useState(initial?.published ?? false);
  const [confidential, setConfidential] = useState(
    initial?.confidential ?? false,
  );

  const canSubmit = title.trim().length > 0 && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit({
      title: title.trim(),
      body: body.trim().length > 0 ? body : null,
      published,
      confidential,
    });
  }

  return (
    <form className='space-y-6' onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor='library-document-title'>
            {t('library.form.title')}
          </FieldLabel>
          <Input
            id='library-document-title'
            maxLength={MAX_TITLE_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('library.form.titlePlaceholder')}
            value={title}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='library-document-body'>
            {t('library.form.body')}
          </FieldLabel>
          <Textarea
            id='library-document-body'
            onChange={(event) => setBody(event.target.value)}
            placeholder={t('library.form.bodyPlaceholder')}
            rows={8}
            value={body}
          />
        </Field>
        <Field orientation='horizontal'>
          <div className='flex flex-1 flex-col gap-1'>
            <FieldLabel htmlFor='library-document-published'>
              {t('library.form.published')}
            </FieldLabel>
            <FieldDescription>
              {t('library.form.publishedHint')}
            </FieldDescription>
          </div>
          <Switch
            checked={published}
            id='library-document-published'
            onCheckedChange={setPublished}
          />
        </Field>
        <Field orientation='horizontal'>
          <div className='flex flex-1 flex-col gap-1'>
            <FieldLabel htmlFor='library-document-confidential'>
              {t('library.form.confidential')}
            </FieldLabel>
            <FieldDescription>
              {t('library.form.confidentialHint')}
            </FieldDescription>
          </div>
          <Switch
            checked={confidential}
            id='library-document-confidential'
            onCheckedChange={setConfidential}
          />
        </Field>
      </FieldGroup>
      <div className='flex justify-end gap-2'>
        <Button
          disabled={isSubmitting}
          onClick={onCancel}
          type='button'
          variant='outline'
        >
          {t('actions.cancel')}
        </Button>
        <Button disabled={!canSubmit} type='submit'>
          {isSubmitting ? t('library.form.saving') : t('actions.save')}
        </Button>
      </div>
    </form>
  );
}
