import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

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

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly danger?: boolean;
  readonly pending?: boolean;
  readonly onConfirm: () => void;
}

/** Small confirmation dialog used for destructive actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger = false,
  pending = false,
  onConfirm,
}: ConfirmDialogProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('officeSupplies.cancel')}
          </Button>
          <Button
            type='button'
            variant={danger ? 'destructive' : 'default'}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && <Spinner aria-hidden='true' className='mr-2 size-4' />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
