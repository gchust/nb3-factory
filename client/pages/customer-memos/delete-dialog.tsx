import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { deleteCustomerMemo, type CustomerMemo } from './api.js';

export interface CustomerMemoDeleteDialogProps {
  readonly memo: CustomerMemo | null;
  readonly onDeleted: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

export function CustomerMemoDeleteDialog({
  memo,
  onDeleted,
  onOpenChange,
  open,
}: CustomerMemoDeleteDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    if (!memo || deleting) {
      return;
    }

    setDeleting(true);
    try {
      await deleteCustomerMemo(api, memo.id);
      onOpenChange(false);
      onDeleted();
    } catch {
      toast.error(t('customerMemos.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('customerMemos.deleteTitle')}</DialogTitle>
        </DialogHeader>
        <p className='text-sm text-muted-foreground'>
          {t('customerMemos.deleteDescription', {
            name: memo?.customerName ?? '',
          })}
        </p>
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type='button'
            variant='outline'
          >
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={deleting}
            onClick={() => void confirm()}
            type='button'
            variant='destructive'
          >
            {deleting
              ? t('customerMemos.deleting')
              : t('customerMemos.deleteConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
