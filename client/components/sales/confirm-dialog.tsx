import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly destructive?: boolean;
  readonly onConfirm: () => void | Promise<void>;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * A small confirm dialog. The confirm button shows a spinner while the action
 * is in flight and closes the dialog when it settles.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps): ReactNode {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handleConfirm = async (): Promise<void> => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() => onOpenChange(false)}
            variant='outline'
          >
            {t('actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            disabled={busy}
            onClick={() => void handleConfirm()}
            variant={destructive ? 'destructive' : 'default'}
          >
            {busy
              ? t('sales.actions.processing', { defaultValue: 'Processing…' })
              : (confirmLabel ??
                t('actions.confirm', { defaultValue: 'Confirm' }))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
