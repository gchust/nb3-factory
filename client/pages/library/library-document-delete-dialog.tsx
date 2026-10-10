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

import { deleteLibraryDocument } from './library-api.js';
import type { LibraryDocument } from './types.js';

export interface LibraryDocumentDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The record to delete. The parent keeps it after closing, so the title does not go blank during the exit animation. */
  readonly document: Pick<LibraryDocument, 'id' | 'title'> | null | undefined;
  /** Called when the delete succeeds or the record was already gone (404). */
  readonly onDeleted: () => void;
  /** Where focus goes after the delete, since the row that opened the dialog disappears. */
  readonly deletedFocusRef?: RefObject<HTMLElement | null>;
}

type DeleteError = 'sessionExpired' | 'forbidden' | 'requestFailed';

/** Confirms the destructive delete of one document. */
export function LibraryDocumentDeleteDialog({
  deletedFocusRef,
  document,
  onDeleted,
  onOpenChange,
  open,
}: LibraryDocumentDeleteDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<DeleteError>();
  const deletedRef = useRef(false);

  async function confirmDelete(
    target: Pick<LibraryDocument, 'id' | 'title'>,
  ): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      await deleteLibraryDocument(api, target.id);
      toaster.show({
        type: 'success',
        title: t('library.delete.success', { name: target.title }),
      });
    } catch (caught) {
      const status = caught instanceof ApiClientError ? caught.status : 0;
      if (status !== 404) {
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
      // Already gone: the user's intent is satisfied, so treat it as a successful delete.
      toaster.show({
        type: 'info',
        title: t('library.delete.notFound', { name: target.title }),
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
        if (!next && pending) return;
        if (!next) setError(undefined);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        finalFocus={() => {
          const target = deletedRef.current ? deletedFocusRef?.current : null;
          deletedRef.current = false;
          return target ?? true;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('library.delete.title', { name: document?.title ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('library.delete.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error === 'sessionExpired'
              ? t('library.error.sessionExpired')
              : error === 'forbidden'
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
