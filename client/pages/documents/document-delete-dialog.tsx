import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, type RefObject, useRef, useState } from 'react';

import { SessionExpiredAlert } from '#components/session-expired-alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Spinner } from '#components/ui/spinner';
import { DocumentsClient, type DocumentItem } from '#lib/documents-client';

export interface DocumentDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The record to delete. The parent keeps it after closing, so the title does not go blank during the exit animation. */
  readonly document: Pick<DocumentItem, 'id' | 'title'> | null | undefined;
  /** The delete succeeded, or someone else already deleted the record. The parent refreshes and closes. */
  readonly onDeleted: () => void;
  /** Where focus goes after the delete; the row's "More" button disappears with the record. */
  readonly deletedFocusRef?: RefObject<HTMLElement | null>;
}

/** The delete confirmation, shared by the list's row menu and the detail drawer. */
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
    target: Pick<DocumentItem, 'id' | 'title'>,
  ): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      await new DocumentsClient(api).remove(target.id);
      toaster.show({
        type: 'success',
        title: t('documents.delete.success', { name: target.title }),
      });
    } catch (caught: unknown) {
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
      // Someone else already deleted it: what the person wanted has happened, so report it and treat it as success.
      toaster.show({
        type: 'info',
        title: t('documents.delete.notFound', { name: target.title }),
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
            {t('documents.delete.title', { name: document?.title ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('documents.delete.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error === 'sessionExpired' ? (
          <SessionExpiredAlert />
        ) : error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error === 'forbidden'
              ? t('documents.error.forbidden')
              : t('documents.error.requestFailed')}
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
            {t('documents.delete.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
