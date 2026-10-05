import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { createDocument, updateDocument } from './api.js';
import { libraryErrorKey } from './errors.js';
import type { LibraryDocument } from './types.js';

export interface DocumentFormDialogProps {
  /** The document being edited, or `null` to create a new one. */
  readonly document: LibraryDocument | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}

/**
 * The create/edit form. A document's audience is decided entirely by the
 * `published` and `confidential` switches, so the dialog states what each one
 * means to a reader instead of leaving the consequence implicit.
 */
export function DocumentFormDialog({
  document,
  open,
  onOpenChange,
  onSaved,
}: DocumentFormDialogProps): ReactElement {
  const api = useApiClient();
  const toaster = useToaster();
  const { t } = useTranslation();
  const [title, setTitle] = useState(document?.title ?? '');
  const [content, setContent] = useState(document?.content ?? '');
  const [published, setPublished] = useState(document?.published ?? false);
  const [confidential, setConfidential] = useState(
    document?.confidential ?? false,
  );
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!title.trim()) {
      toaster.show({ type: 'error', title: t('library.titleRequired') });
      return;
    }
    setSaving(true);
    const input = {
      title: title.trim(),
      content: content.trim() ? content : null,
      published,
      confidential,
    };
    try {
      if (document) {
        await updateDocument(api, document.id, input);
      } else {
        await createDocument(api, input);
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t(libraryErrorKey(error, 'library.actionFailed')),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>
              {document
                ? t('library.form.editTitle')
                : t('library.form.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('library.form.description')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor='library-title'>
                {t('library.form.title')}
              </FieldLabel>
              <Input
                id='library-title'
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('library.form.titlePlaceholder')}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='library-content'>
                {t('library.form.content')}
              </FieldLabel>
              <Textarea
                id='library-content'
                rows={6}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={t('library.form.contentPlaceholder')}
              />
            </Field>
            <Field>
              <div className='flex items-center justify-between gap-4'>
                <FieldLabel htmlFor='library-published'>
                  {t('library.form.published')}
                </FieldLabel>
                <Switch
                  id='library-published'
                  checked={published}
                  onCheckedChange={setPublished}
                />
              </div>
              <FieldDescription>
                {t('library.form.publishedHint')}
              </FieldDescription>
            </Field>
            <Field>
              <div className='flex items-center justify-between gap-4'>
                <FieldLabel htmlFor='library-confidential'>
                  {t('library.form.confidential')}
                </FieldLabel>
                <Switch
                  id='library-confidential'
                  checked={confidential}
                  onCheckedChange={setConfidential}
                />
              </div>
              <FieldDescription>
                {t('library.form.confidentialHint')}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('library.actions.cancel')}
            </Button>
            <Button type='submit' disabled={saving}>
              {saving ? t('library.actions.saving') : t('library.actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
