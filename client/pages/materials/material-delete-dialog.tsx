import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, type RefObject, useState } from 'react';

import { SessionExpiredAlert } from '#components/session-expired-alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';

import type { Material } from './types.js';

export interface MaterialDeleteDialogProps {
  /** The material to delete, or `null` while the dialog is closed. */
  readonly material: Material | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The record is gone: refresh the list. */
  readonly onDeleted: () => void;
  /** Restore focus here after deletion removes the dialog (guideline A6). */
  readonly deletedFocusRef?: RefObject<HTMLElement | null>;
}

/** Confirms deleting a material; used by the list and the detail drawer. */
export function MaterialDeleteDialog({
  material,
  open,
  onOpenChange,
  onDeleted,
  deletedFocusRef,
}: MaterialDeleteDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  async function handleDelete(): Promise<void> {
    if (!material) return;
    setDeleting(true);
    setFailed(false);
    try {
      await api.request({
        path: `materials/${encodeURIComponent(String(material.id))}`,
        method: 'DELETE',
      });
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 401) {
        setSessionExpired(true);
      } else if (error instanceof ApiClientError && error.status === 404) {
        // Already deleted, by this user in another tab. Say so plainly rather than reporting a failure.
        toaster.show({ type: 'success', title: t('materials.delete.success') });
        onDeleted();
        deletedFocusRef?.current?.focus();
      } else {
        setFailed(true);
      }
      return;
    } finally {
      setDeleting(false);
    }
    toaster.show({ type: 'success', title: t('materials.delete.success') });
    onDeleted();
    deletedFocusRef?.current?.focus();
  }

  return (
    <AlertDialog
      open={open}
      // No closing while the request runs: the × button does not apply here, Esc does.
      onOpenChange={(next) => {
        if (!deleting) onOpenChange(next);
      }}
    >
      <AlertDialogContent size='sm'>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('materials.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('materials.delete.description', {
              title: material?.title ?? '',
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {sessionExpired ? <SessionExpiredAlert /> : null}
        {failed ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('materials.error.requestFailed')}
            </AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <Button
            variant='destructive'
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? <Spinner data-icon='inline-start' /> : null}
            {deleting
              ? t('materials.delete.deleting')
              : t('materials.actions.delete')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
