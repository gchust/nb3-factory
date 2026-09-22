import { useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

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

import type { CustomerMemo } from './types.js';

export interface MemoDeleteDialogProps {
  readonly open: boolean;
  readonly memo: CustomerMemo | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (memo: CustomerMemo) => Promise<void>;
}

/**
 * Second confirmation for deleting a memo. Cancelling or dismissing the dialog
 * leaves the record untouched; only the confirm button calls `onConfirm`.
 */
export function MemoDeleteDialog({
  memo,
  open,
  onOpenChange,
  onConfirm,
}: MemoDeleteDialogProps): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!memo) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onConfirm(memo);
    } catch {
      setError(t('memos.deleteFailed'));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!submitting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('memos.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('memos.deleteDescription', {
              name: memo?.customerName ?? '',
            })}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            type='button'
            variant='destructive'
            disabled={submitting}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {submitting ? <Spinner /> : null}
            {t('actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
