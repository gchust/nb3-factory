import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { updateDocument, type KnowledgeDocument } from './document-api.js';

export interface EditDocumentDialogProps {
  readonly document: KnowledgeDocument;
  readonly onClose: () => void;
  readonly onSaved: (document: KnowledgeDocument) => void;
}

/** The document title (max 255) and body are the only fields a supervisor edits. */
const TITLE_MAX_LENGTH = 255;

/** The failure the server reported, mapped to the copy that explains it. */
const ERROR_KEYS: Record<string, string> = {
  AUTHORIZATION_DENIED: 'knowledge.documents.errors.forbidden',
  KNOWLEDGE_DOCUMENT_NOT_FOUND: 'knowledge.documents.errors.notFound',
  KNOWLEDGE_EMPTY_UPDATE: 'knowledge.documents.errors.empty',
};

function describeError(cause: unknown): string {
  if (cause instanceof ApiClientError && cause.reason) {
    return ERROR_KEYS[cause.reason] ?? 'knowledge.documents.errors.saveFailed';
  }
  return 'knowledge.documents.errors.saveFailed';
}

/**
 * The supervisor-only edit form, opened from the documents page.
 *
 * The server enforces the `manage` grant on the endpoint, so a colleague who
 * somehow reached this dialog is still refused; the page simply does not offer
 * it. There is no field for `visibility`: it is server-owned, like the
 * timestamps.
 */
export function EditDocumentDialog({
  document,
  onClose,
  onSaved,
}: EditDocumentDialogProps): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [title, setTitle] = useState(document.title);
  const [body, setBody] = useState(document.body);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const changed =
    trimmedTitle !== document.title || trimmedBody !== document.body;
  const canSave =
    trimmedTitle.length > 0 && trimmedBody.length > 0 && changed && !saving;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setErrorKey(null);
    try {
      const updated = await updateDocument(api, document.id, {
        title: trimmedTitle,
        body: trimmedBody,
      });
      onSaved(updated);
    } catch (cause) {
      setErrorKey(describeError(cause));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !saving) onClose();
      }}
    >
      <DialogContent>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('knowledge.documents.edit.title')}</DialogTitle>
            <DialogDescription>
              {t('knowledge.documents.edit.description')}
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-2'>
            <Label htmlFor='knowledge-document-title'>
              {t('knowledge.documents.field.title')}
            </Label>
            <Input
              id='knowledge-document-title'
              maxLength={TITLE_MAX_LENGTH}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='knowledge-document-body'>
              {t('knowledge.documents.field.body')}
            </Label>
            <Textarea
              id='knowledge-document-body'
              className='min-h-40'
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>

          {errorKey ? (
            <Alert variant='destructive'>
              <AlertDescription>{t(errorKey)}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={saving}
              onClick={onClose}
            >
              {t('actions.cancel')}
            </Button>
            <Button type='submit' disabled={!canSave}>
              {saving
                ? t('knowledge.documents.edit.saving')
                : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
