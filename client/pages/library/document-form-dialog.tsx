import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';

import type { LibraryDocument, LibraryDocumentInput } from './types.js';

export function DocumentFormDialog({
  open,
  document,
  onOpenChange,
  onSaved,
}: {
  readonly open: boolean;
  readonly document?: LibraryDocument;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: (document: LibraryDocument) => void;
}): ReactElement | null {
  if (!open) return null;
  return (
    <OpenDocumentFormDialog
      key={document?.id ?? 'new'}
      document={document}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}

/**
 * The fields live in a component that only exists while the dialog is open, so
 * every opening starts from the current document without an effect that resets
 * five pieces of state after the first render.
 */
function OpenDocumentFormDialog({
  document,
  onOpenChange,
  onSaved,
}: {
  readonly document?: LibraryDocument;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: (document: LibraryDocument) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [title, setTitle] = useState(document?.title ?? '');
  const [body, setBody] = useState(document?.body ?? '');
  const [published, setPublished] = useState(document?.published ?? false);
  const [confidential, setConfidential] = useState(
    document?.confidential ?? false,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const save = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    const input: LibraryDocumentInput = {
      title: title.trim(),
      body,
      published,
      confidential,
    };
    try {
      const result = await api.request<{ data: LibraryDocument }>({
        path: document
          ? `library/documents/${encodeURIComponent(document.id)}`
          : 'library/documents',
        method: document ? 'PATCH' : 'POST',
        json: input,
      });
      onSaved(result.data);
      onOpenChange(false);
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };

  const errorText =
    error instanceof ApiClientError && error.status === 403
      ? t('library.errors.denied')
      : t('library.errors.saveFailed');

  return (
    <Dialog open onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className='gap-5 sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {document
              ? t('library.form.editTitle')
              : t('library.form.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {document
              ? t('library.form.editDescription')
              : t('library.form.createDescription')}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{errorText}</AlertDescription>
          </Alert>
        ) : null}
        <div className='flex flex-col gap-2'>
          <Label htmlFor='library-title'>{t('library.form.title')}</Label>
          <Input
            id='library-title'
            value={title}
            maxLength={255}
            autoFocus
            placeholder={t('library.form.titlePlaceholder')}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='library-body'>{t('library.form.body')}</Label>
          <Textarea
            id='library-body'
            className='field-sizing-fixed min-h-56 resize-y leading-6'
            value={body}
            placeholder={t('library.form.bodyPlaceholder')}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        <div className='flex flex-col gap-3 rounded-lg border p-4'>
          <label className='flex items-start gap-3'>
            <Checkbox
              className='mt-0.5'
              checked={published}
              onCheckedChange={(checked) => setPublished(checked === true)}
            />
            <span>
              <span className='block font-medium'>
                {t('library.form.published')}
              </span>
              <span className='block text-sm text-muted-foreground'>
                {t('library.form.publishedHint')}
              </span>
            </span>
          </label>
          <label className='flex items-start gap-3'>
            <Checkbox
              className='mt-0.5'
              checked={confidential}
              onCheckedChange={(checked) => setConfidential(checked === true)}
            />
            <span>
              <span className='block font-medium'>
                {t('library.form.confidential')}
              </span>
              <span className='block text-sm text-muted-foreground'>
                {t('library.form.confidentialHint')}
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t('library.actions.cancel')}
          </Button>
          <Button disabled={!title.trim() || busy} onClick={() => void save()}>
            {busy ? t('library.actions.saving') : t('library.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
