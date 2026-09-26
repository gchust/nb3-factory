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

import type { CustomerMemo } from './types.js';

/**
 * Confirms deleting one memo. A confirmation dialog concerns a single action, so its open state belongs to the
 * caller rather than the URL.
 */
export interface CustomerMemoDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The record to delete. The caller keeps it after closing so the title does not go blank during the exit animation. */
  readonly memo: Pick<CustomerMemo, 'id' | 'name'> | null | undefined;
  /** Called once the delete has succeeded — or the record was already gone. The caller closes the dialog and reloads. */
  readonly onDeleted: () => void;
  /** Where focus goes afterwards; the row's menu disappears together with the record. */
  readonly deletedFocusRef?: RefObject<HTMLElement | null>;
}

export function CustomerMemoDeleteDialog({
  open,
  onOpenChange,
  memo,
  onDeleted,
  deletedFocusRef,
}: CustomerMemoDeleteDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const deletedRef = useRef(false);

  async function confirmDelete(
    target: Pick<CustomerMemo, 'id' | 'name'>,
  ): Promise<void> {
    setPending(true);
    setFailed(false);
    try {
      await api.request({
        path: `customer-memos/${target.id}`,
        method: 'DELETE',
      });
      toast.add({
        type: 'success',
        title: t('customerMemos.deleteSuccess', { name: target.name }),
      });
    } catch (caught: unknown) {
      const status = caught instanceof ApiClientError ? caught.status : 0;
      if (status !== 404) {
        // Keep the dialog open and explain the failure inside it, without the backend's raw message.
        setFailed(true);
        setPending(false);
        return;
      }
      // 404: somebody else already deleted it. What the user wanted has happened.
      toast.add({
        type: 'info',
        title: t('customerMemos.deleteNotFound', { name: target.name }),
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
        // No closing while the delete is in flight, whichever way the close was requested.
        if (!next && pending) return;
        if (!next) setFailed(false);
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
            {t('customerMemos.deleteTitle', { name: memo?.name ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('customerMemos.deleteDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed ? (
          <p role='alert' className='text-sm text-destructive'>
            {t('customerMemos.requestFailed')}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            disabled={pending}
            onClick={() => {
              if (memo) void confirmDelete(memo);
            }}
          >
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('customerMemos.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
