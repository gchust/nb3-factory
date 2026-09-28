import { ApiClientError, useApiClient } from '@nocobase/app-client';
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
import { toast } from '@/components/ui/toast';

import { deleteMemo } from './memo-api.js';
import type { CustomerMemo } from './types.js';

export interface MemoDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The memo to delete. The parent keeps it after closing, so the title does not go blank during the exit animation. */
  readonly memo: Pick<CustomerMemo, 'id' | 'name'> | null | undefined;
  /** Called when the delete succeeds or the memo was already deleted. The parent closes the dialog (or drawer) and refreshes the list. */
  readonly onDeleted: () => void;
  /** Where focus goes after the delete when the button that opened the dialog disappears with the row. */
  readonly deletedFocusRef?: RefObject<HTMLElement | null>;
}

/** The single delete confirmation, shared by the list's row menu and the detail drawer. */
export function MemoDeleteDialog({
  open,
  onOpenChange,
  memo,
  onDeleted,
  deletedFocusRef,
}: MemoDeleteDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'forbidden' | 'requestFailed'>();
  const deletedRef = useRef(false);

  async function confirmDelete(
    target: Pick<CustomerMemo, 'id' | 'name'>,
  ): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      await deleteMemo(api, target.id);
      toast.add({
        type: 'success',
        title: t('memos.delete.success', { name: target.name }),
      });
    } catch (caught: unknown) {
      const status = caught instanceof ApiClientError ? caught.status : 0;
      if (status !== 404) {
        // Keep the dialog open and explain the reason inside it.
        setError(status === 403 ? 'forbidden' : 'requestFailed');
        setPending(false);
        return;
      }
      // Someone else already deleted it: what the user wanted has happened.
      toast.add({
        type: 'info',
        title: t('memos.delete.notFound', { name: target.name }),
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
        // No closing while the delete is in progress.
        if (!next && pending) return;
        if (!next) setError(undefined);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        finalFocus={() => {
          const target = deletedRef.current ? deletedFocusRef?.current : null;
          deletedRef.current = false;
          // Returning true keeps the default: focus returns to the element that opened the dialog.
          return target ?? true;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('memos.delete.title', { name: memo?.name ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('memos.delete.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error === 'forbidden'
              ? t('memos.error.forbidden')
              : t('memos.error.requestFailed')}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            disabled={pending || error === 'forbidden'}
            onClick={() => {
              if (memo) void confirmDelete(memo);
            }}
          >
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('memos.delete.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
