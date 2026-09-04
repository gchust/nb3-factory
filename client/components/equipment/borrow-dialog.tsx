import { useTranslation } from '@nocobase/i18n/client';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

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
import { Textarea } from '@/components/ui/textarea';

import { EquipmentStatusBadge } from './equipment-status-badge.js';
import type { BorrowCreatePayload, EquipmentListItem } from './types.js';

export interface BorrowDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly equipment: EquipmentListItem;
  readonly onSubmit: (payload: BorrowCreatePayload) => Promise<void>;
}

/** Registers a borrow of one piece of equipment by the current user. */
export function BorrowDialog({
  open,
  onOpenChange,
  equipment,
  onSubmit,
}: BorrowDialogProps): ReactElement {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        equipmentId: equipment.id,
        note: note.trim().length > 0 ? note.trim() : null,
      });
      onOpenChange(false);
      setNote('');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('equipment.errors.unexpected'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(next: boolean) => {
        if (next) {
          setNote('');
          setError(null);
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('equipment.dialog.borrowTitle')}</DialogTitle>
          <DialogDescription>
            <span className='flex items-center gap-2'>
              {equipment.name}
              <span className='text-muted-foreground'>
                {equipment.assetNumber}
              </span>
              <EquipmentStatusBadge status={equipment.status} />
            </span>
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className='space-y-2'>
            <Label htmlFor='borrow-note'>{t('equipment.fields.note')}</Label>
            <Textarea
              autoFocus
              id='borrow-note'
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('equipment.dialog.borrowNotePlaceholder')}
              rows={3}
              value={note}
            />
          </div>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          <DialogFooter showCloseButton>
            <Button disabled={submitting} type='submit'>
              {submitting ? <Loader2 className='animate-spin' /> : null}
              {t('equipment.actions.borrow')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
