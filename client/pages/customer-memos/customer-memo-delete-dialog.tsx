import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, type RefObject, useRef, useState } from 'react';
import { toast } from 'sonner';

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

import type { CustomerMemo } from './types.js';

export interface CustomerMemoDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The record to delete. The parent keeps it after closing, so the title does not go blank during the exit animation. */
  readonly memo: Pick<CustomerMemo, 'id' | 'customerName'> | null | undefined;
  /** Called when the delete succeeds or the record was already deleted by someone else (404). */
  readonly onDeleted: () => void;
  /** Where focus goes after the delete. The button that opened the confirmation dialog usually disappears along with the record. */
  readonly deletedFocusRef?: RefObject<HTMLElement | null>;
}

/** Confirmation for one destructive action, shared by the list's row menu and the detail drawer. */
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
  const [error, setError] = useState<'forbidden' | 'requestFailed'>();
  const deletedRef = useRef(false);

  async function confirmDelete(
    target: Pick<CustomerMemo, 'id' | 'customerName'>,
  ): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      await api.request({
        path: `customer-memos/${target.id}`,
        method: 'DELETE',
      });
      toast.success(
        t('customerMemos.delete.success', { name: target.customerName }),
      );
    } catch (caught: unknown) {
      const status = caught instanceof ApiClientError ? caught.status : 0;
      if (status !== 404) {
        // Other failures: keep the confirmation dialog open and explain the reason inside it, without the backend's raw message.
        setError(status === 403 ? 'forbidden' : 'requestFailed');
        setPending(false);
        return;
      }
      // 404: someone else already deleted the record. What the user wanted has already happened.
      toast.info(
        t('customerMemos.delete.notFound', { name: target.customerName }),
      );
    }
    setPending(false);
    deletedRef.current = true;
    onDeleted();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // No closing while the delete is in progress (Esc, clicking the backdrop and the cancel button all end up here).
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
          return target ?? true;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('customerMemos.delete.title', {
              name: memo?.customerName ?? '',
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('customerMemos.delete.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error === 'forbidden'
              ? t('customerMemos.error.forbidden')
              : t('customerMemos.error.requestFailed')}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          {/* Does not close automatically: on success, onDeleted has the parent close it. */}
          <AlertDialogAction
            variant='destructive'
            // Without permission a retry will not succeed either, so the button can no longer be clicked.
            disabled={pending || error === 'forbidden'}
            onClick={() => {
              if (memo) void confirmDelete(memo);
            }}
          >
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('customerMemos.delete.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
