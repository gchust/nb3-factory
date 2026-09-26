import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useRef, useState } from 'react';

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

import { fetchEquipment } from './api.js';
import { BorrowForm } from './borrow-form.js';
import type { EquipmentItem, LoanRecord } from './types.js';

export interface BorrowDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Pre-selects the device when opened from a ledger row. */
  readonly equipmentId?: number;
  readonly onSubmitted: (loan: LoanRecord) => void;
}

const FORM_ID = 'equipment-borrow-form';

/**
 * Container for the borrow form. It loads the devices that can be lent right
 * now, disables the buttons while submitting, and cannot be closed mid-write.
 */
export function BorrowDialog({
  open,
  onOpenChange,
  equipmentId,
  onSubmitted,
}: BorrowDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const requestKey = `${open ? 'open' : 'closed'}:${equipmentId ?? 'none'}`;
  const [options, setOptions] = useState<EquipmentItem[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const ready = loadedKey === requestKey;
  const loadFailed = failedKey === requestKey;

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    void fetchEquipment(api, { status: 'available' })
      .then((result) => {
        if (active) {
          setOptions(result.items);
          setLoadedKey(requestKey);
        }
      })
      .catch(() => {
        if (active) setFailedKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [open, api, requestKey]);

  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submittingRef.current) onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('equipment.borrow.title')}</DialogTitle>
          <DialogDescription>
            {t('equipment.borrow.description')}
          </DialogDescription>
        </DialogHeader>
        {loadFailed ? (
          <div className='flex min-h-32 items-center justify-center'>
            <p className='text-sm text-destructive'>
              {t('equipment.error.requestFailed')}
            </p>
          </div>
        ) : ready ? (
          <BorrowForm
            options={options}
            equipmentId={equipmentId}
            formId={FORM_ID}
            onSubmitted={onSubmitted}
            onSubmittingChange={handleSubmittingChange}
            onGone={() => onOpenChange(false)}
          />
        ) : (
          <div className='flex min-h-32 items-center justify-center'>
            <Spinner className='size-5' />
          </div>
        )}
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button type='submit' form={FORM_ID} disabled={submitting || !ready}>
            {submitting ? <Spinner data-icon='inline-start' /> : null}
            {submitting ? t('actions.saving') : t('equipment.borrow.action')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
