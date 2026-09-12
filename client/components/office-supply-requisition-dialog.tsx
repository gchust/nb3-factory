import { useTranslation } from '@nocobase/i18n/client';
import type { FormEvent, ReactElement } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { fromDateTimeLocal, toDateTimeLocal } from '@/lib/format';
import type { SupplyRequisitionInput } from '@/lib/office-supplies';

export interface OfficeSupplyRequisitionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly supplyName: string;
  /** Current stock, used both as the input maximum and for the hint. */
  readonly availableQuantity: number;
  readonly unit: string;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSubmit: (input: SupplyRequisitionInput) => Promise<void>;
}

export function OfficeSupplyRequisitionDialog({
  open,
  onOpenChange,
  supplyName,
  availableQuantity,
  unit,
  pending,
  error,
  onSubmit,
}: OfficeSupplyRequisitionDialogProps): ReactElement {
  const { t } = useTranslation();
  const [requisitioner, setRequisitioner] = useState('');
  const [quantity, setQuantity] = useState('');
  const [requisitionedAt, setRequisitionedAt] = useState(() =>
    toDateTimeLocal(new Date()),
  );
  const [remark, setRemark] = useState('');

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 1 ||
      parsedQuantity > availableQuantity
    ) {
      return;
    }
    void onSubmit({
      requisitioner: requisitioner.trim(),
      quantity: parsedQuantity,
      requisitionedAt: fromDateTimeLocal(requisitionedAt),
      remark: remark.trim() === '' ? null : remark.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('officeSupplies.requisition')}</DialogTitle>
            <DialogDescription>
              {t('officeSupplies.requisitionForm.hint', {
                name: supplyName,
                quantity: availableQuantity,
                unit,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-4 py-2'>
            <div className='grid gap-2'>
              <Label htmlFor='requisition-requisitioner'>
                {t('officeSupplies.fields.requisitioner')} *
              </Label>
              <Input
                id='requisition-requisitioner'
                value={requisitioner}
                onChange={(event) => setRequisitioner(event.target.value)}
                placeholder={t(
                  'officeSupplies.requisitionForm.requisitionerPlaceholder',
                )}
                required
                maxLength={64}
              />
            </div>
            <div className='grid grid-cols-2 gap-4'>
              <div className='grid gap-2'>
                <Label htmlFor='requisition-quantity'>
                  {t('officeSupplies.fields.quantity')} *
                </Label>
                <Input
                  id='requisition-quantity'
                  type='number'
                  min={1}
                  max={availableQuantity}
                  step={1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='requisition-time'>
                  {t('officeSupplies.fields.requisitionedAt')} *
                </Label>
                <Input
                  id='requisition-time'
                  type='datetime-local'
                  value={requisitionedAt}
                  onChange={(event) => setRequisitionedAt(event.target.value)}
                  required
                />
              </div>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='requisition-remark'>
                {t('officeSupplies.fields.remark')}
              </Label>
              <Textarea
                id='requisition-remark'
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                placeholder={t(
                  'officeSupplies.requisitionForm.remarkPlaceholder',
                )}
                rows={3}
              />
            </div>
            {availableQuantity === 0 && (
              <p className='text-sm text-destructive'>
                {t('officeSupplies.errors.INSUFFICIENT_STOCK')}
              </p>
            )}
          </div>

          {error && <p className='text-sm text-destructive'>{error}</p>}

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {t('officeSupplies.cancel')}
            </Button>
            <Button type='submit' disabled={pending}>
              {pending && (
                <Spinner aria-hidden='true' className='mr-2 size-4' />
              )}
              {t('officeSupplies.confirmRequisition')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
