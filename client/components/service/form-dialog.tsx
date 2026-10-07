/**
 * A modal form shared by the create and edit dialogs of the service pages.
 *
 * It owns the submit lifecycle — one in-flight request, a rejected request shown
 * in place, a successful one closing the dialog — so every page reports a failed
 * save the same way instead of each inventing its own handling.
 */

import { useTranslation } from '@nocobase/i18n/client';
import type { FormEvent, ReactElement, ReactNode } from 'react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { errorMessage } from './states.js';

export interface FormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  /** Persists the form; a rejection keeps the dialog open and shows the message. */
  readonly onSubmit: () => Promise<void>;
  readonly submitLabel?: string;
  readonly canSubmit?: boolean;
  readonly wide?: boolean;
}

/** A labelled form control; the label is associated with the control by id. */
export function Field({
  label,
  htmlFor,
  children,
  hint,
  className,
}: {
  readonly label: ReactNode;
  readonly htmlFor?: string;
  readonly children: ReactNode;
  readonly hint?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p className='text-xs text-muted-foreground'>{hint}</p>
      ) : null}
    </div>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel,
  canSubmit = true,
  wide = false,
}: FormDialogProps): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !canSubmit) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit();
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={wide ? 'sm:max-w-2xl' : undefined}
        showCloseButton={!submitting}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <form onSubmit={handleSubmit} className='grid gap-4'>
          {children}
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {errorMessage(error, t('service.error.saveFailed'))}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              {t('service.action.cancel')}
            </Button>
            <Button type='submit' disabled={submitting || !canSubmit}>
              {submitting
                ? t('service.action.saving')
                : (submitLabel ?? t('service.action.save'))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
