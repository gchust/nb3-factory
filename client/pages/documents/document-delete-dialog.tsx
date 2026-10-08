import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { SessionExpiredAlert } from '@/components/session-expired-alert';
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
import { Spinner } from '@/components/ui/spinner';

import type { Document } from './types.js';

export interface DocumentDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly document: Document | null;
  /** The delete succeeded; the caller refreshes and closes. */
  readonly onDeleted: () => void;
}

/** Confirms deleting one document. Mount it wherever a document can be deleted. */
export function DocumentDeleteDialog({
  open,
  onOpenChange,
  document,
  onDeleted,
}: DocumentDeleteDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>();

  async function confirm(): Promise<void> {
    if (!document) {
      return;
    }
    setDeleting(true);
    setError(undefined);
    try {
      await api.request({
        path: `documents/${encodeURIComponent(String(document.id))}`,
        method: 'DELETE',
      });
    } catch (caught: unknown) {
      setError(caught);
      setDeleting(false);
      return;
    }
    setDeleting(false);
    onDeleted();
  }

  const apiError = error instanceof ApiClientError ? error : undefined;
  const sessionExpired = apiError?.status === 401;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (deleting) {
          return;
        }
        setError(undefined);
        onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('library.delete.title')}</DialogTitle>
          <DialogDescription>
            {t('library.delete.description', {
              title: document?.title ?? '',
            })}
          </DialogDescription>
        </DialogHeader>
        {sessionExpired ? (
          <SessionExpiredAlert />
        ) : error ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>
              {apiError?.status === 403 || apiError?.status === 404
                ? t('library.error.forbidden')
                : t('library.error.requestFailed')}
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button
            variant='outline'
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            variant='destructive'
            disabled={deleting}
            onClick={() => void confirm()}
          >
            {deleting ? <Spinner data-icon='inline-start' /> : null}
            {t('actions.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
