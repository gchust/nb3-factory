import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface FormDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly submitLabel?: string;
  readonly children: ReactNode;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: () => Promise<void>;
}

/**
 * A dialog that runs `onSubmit` on submit, shows a spinner while it is in
 * flight, and displays the failure message inline when it rejects.
 */
export function FormDialog({
  open,
  title,
  description,
  submitLabel,
  children,
  onOpenChange,
  onSubmit,
}: FormDialogProps): ReactNode {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className='space-y-4 py-2'>{children}</div>
          {error ? (
            <p className='rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={() => onOpenChange(false)}
              type='button'
              variant='outline'
            >
              {t('actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button disabled={busy} type='submit'>
              {busy
                ? t('sales.actions.processing', { defaultValue: 'Processing…' })
                : (submitLabel ?? t('actions.save', { defaultValue: 'Save' }))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
