import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useRouteOverlay } from '@/components/use-route-overlay';

import type { DocumentDraft, DocumentRecord } from './types.js';

export interface DocumentFormProps {
  /** The record to edit; absent creates a new one. */
  readonly document?: DocumentRecord | null;
  /** Called with the saved record before the dialog closes. */
  readonly onSaved: (document: DocumentRecord) => void;
}

/** The shared create and edit form. Creating publishes nothing until asked. */
export function DocumentForm({
  document,
  onSaved,
}: DocumentFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { close } = useRouteOverlay();
  const [draft, setDraft] = useState<DocumentDraft>({
    title: document?.title ?? '',
    body: document?.body ?? '',
    published: document?.published ?? false,
    confidential: document?.confidential ?? false,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!draft.title.trim() || saving) {
      return;
    }
    setSaving(true);
    try {
      const json = {
        title: draft.title.trim(),
        body: draft.body,
        published: draft.published,
        confidential: draft.confidential,
      };
      const { data } = document
        ? await api.request<{ data: DocumentRecord }>({
            path: `library/documents/${document.id}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: DocumentRecord }>({
            path: 'library/documents',
            method: 'POST',
            json,
          });
      onSaved(data);
      toast.add({
        type: 'success',
        title: document ? t('library.form.saved') : t('library.form.created'),
        description: data.title,
      });
      await close();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('library.form.saveFailed'),
        description:
          error instanceof ApiClientError && error.status === 403
            ? t('library.form.forbidden')
            : t('library.form.retry'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <FieldGroup className='py-4'>
        <Field>
          <FieldLabel htmlFor='document-title'>
            {t('library.field.title')}
          </FieldLabel>
          <Input
            id='document-title'
            value={draft.title}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='document-body'>
            {t('library.field.body')}
          </FieldLabel>
          <Textarea
            id='document-body'
            value={draft.body}
            rows={8}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                body: event.target.value,
              }))
            }
          />
        </Field>
        <Field orientation='horizontal'>
          <Checkbox
            id='document-published'
            checked={draft.published}
            onCheckedChange={(checked) =>
              setDraft((current) => ({
                ...current,
                published: checked === true,
              }))
            }
          />
          <FieldLabel htmlFor='document-published'>
            {t('library.field.published')}
          </FieldLabel>
        </Field>
        <Field orientation='horizontal'>
          <Checkbox
            id='document-confidential'
            checked={draft.confidential}
            onCheckedChange={(checked) =>
              setDraft((current) => ({
                ...current,
                confidential: checked === true,
              }))
            }
          />
          <FieldLabel htmlFor='document-confidential'>
            {t('library.field.confidential')}
          </FieldLabel>
        </Field>
      </FieldGroup>
      <div className='flex justify-end gap-2'>
        <Button
          type='button'
          variant='outline'
          onClick={() => void close()}
          disabled={saving}
        >
          {t('library.form.cancel')}
        </Button>
        <Button type='submit' disabled={saving || !draft.title.trim()}>
          {saving ? t('library.form.saving') : t('library.form.save')}
        </Button>
      </div>
    </form>
  );
}
