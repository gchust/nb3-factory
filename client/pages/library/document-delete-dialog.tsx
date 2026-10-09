import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, type RefObject, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';
import { SessionExpiredAlert } from '@/components/session-expired-alert';

import { deleteDocument } from './document-api.js';
import type { LibraryDocument } from './types.js';

export interface DocumentDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The record to delete. The parent keeps it after closing, so the title does not go blank during the exit animation. */
  readonly document: Pick<LibraryDocument, 'id' | 'title'> | null | undefined;
  /** Called when the delete succeeds or the record was already deleted by someone else (404). */
  readonly onDeleted: () => void;
  /** Where focus goes after the delete. The control that opened the confirmation dialog usually disappears along with the record. */
  readonly deletedFocusRef?: RefObject<HTMLElement | null>;
}

export function DocumentDeleteDialog({
  open,
  onOpenChange,
  document,
  onDeleted,
  deletedFocusRef,
}: DocumentDeleteDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<
    'sessionExpired' | 'forbidden' | 'requestFailed'
  >();
  const deletedRef = useRef(false);

  async function confirmDelete(
    target: Pick<LibraryDocument, 'id' | 'title'>,
  ): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      await deleteDocument(api, target.id);
      toaster.show({
        type: 'success',
        title: t('library.delete.success', { title: target.title }),
      });
    } catch (caught: unknown) {
      const status = caught instanceof ApiClientError ? caught.status : 0;
      if (status !== 404) {
        // Other failures: keep the confirmation dialog open and explain the
        // reason inside it, without showing the backend's raw message.
        setError(
          status === 401
            ? 'sessionExpired'
            : status === 403
              ? 'forbidden'
              : 'requestFailed',
        );
        setPending(false);
        return;
      }
      // 404: someone else already deleted the record. What the user wanted
      // has already happened, so treat it as a successful delete.
      toaster.show({
        type: 'info',
        title: t('library.delete.notFound', { title: target.title }),
      });
    }
    setPending(false);
    deletedRef.current = true;
    onDeleted();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // No closing while the delete is in progress (Esc and the cancel
        // button end up here; an AlertDialog ignores backdrop clicks).
        if (!next && pending) return;
        // Clear the error on close, so the next open starts clean.
        if (!next) setError(undefined);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        finalFocus={() => {
          const target = deletedRef.current ? deletedFocusRef?.current : null;
          deletedRef.current = false;
          // Returning true keeps the default behavior: focus returns to the
          // element that had focus before the dialog opened.
          return target ?? true;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('library.delete.title', { title: document?.title ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('library.delete.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error === 'sessionExpired' ? (
          <SessionExpiredAlert />
        ) : error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error === 'forbidden'
              ? t('library.error.forbidden')
              : t('library.error.requestFailed')}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            disabled={
              pending || (error !== undefined && error !== 'requestFailed')
            }
            onClick={() => {
              if (document) void confirmDelete(document);
            }}
          >
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('library.delete.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
