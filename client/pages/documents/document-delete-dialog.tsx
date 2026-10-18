import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';

import { deleteDocument } from './api.js';
import type { DocumentSummary } from './types.js';

export interface DocumentDeleteDialogProps {
  readonly document: DocumentSummary;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDeleted: () => void;
}

/**
 * Confirms deleting one document. It is component state rather than a route: a confirmation that owns no data and
 * closes on its own does not need a URL. The server enforces the owner rule again; this only avoids a pointless
 * failure.
 */
export function DocumentDeleteDialog({
  document,
  onOpenChange,
  onDeleted,
}: DocumentDeleteDialogProps): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const toaster = useToaster();
  const [busy, setBusy] = useState(false);

  const remove = async (): Promise<void> => {
    setBusy(true);
    try {
      await deleteDocument(api, document.id);
      onDeleted();
    } catch {
      toaster.show({
        type: 'error',
        title: t('library.delete.failed'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('library.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('library.delete.description', { title: document.title })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
          <Button
            variant='destructive'
            disabled={busy}
            onClick={() => void remove()}
          >
            {busy ? t('library.deleting') : t('library.delete.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
