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
import type { OfficeSupply, OfficeSupplyInput } from '@/lib/office-supplies';

export interface OfficeSupplyFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The supply to edit; omit (or pass null) to create a new one. */
  readonly supply?: OfficeSupply | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSubmit: (input: OfficeSupplyInput) => Promise<void>;
}

export function OfficeSupplyFormDialog({
  open,
  onOpenChange,
  supply = null,
  pending,
  error,
  onSubmit,
}: OfficeSupplyFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const [code, setCode] = useState(supply?.code ?? '');
  const [name, setName] = useState(supply?.name ?? '');
  const [category, setCategory] = useState(supply?.category ?? '');
  const [unit, setUnit] = useState(supply?.unit ?? '');
  const [quantity, setQuantity] = useState(
    supply === null ? '' : String(supply.quantity),
  );
  const [remark, setRemark] = useState(supply?.remark ?? '');

  const editing = supply !== null;

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) return;
    void onSubmit({
      code: code.trim(),
      name: name.trim(),
      category: category.trim(),
      unit: unit.trim(),
      quantity: parsedQuantity,
      remark: remark.trim() === '' ? null : remark.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('officeSupplies.editSupply')
                : t('officeSupplies.addSupply')}
            </DialogTitle>
            <DialogDescription>
              {t('officeSupplies.form.instructions')}
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-4 py-2'>
            <div className='grid gap-2'>
              <Label htmlFor='supply-code'>
                {t('officeSupplies.fields.code')} *
              </Label>
              <Input
                id='supply-code'
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={t('officeSupplies.form.codePlaceholder')}
                required
                maxLength={32}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='supply-name'>
                {t('officeSupplies.fields.name')} *
              </Label>
              <Input
                id='supply-name'
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('officeSupplies.form.namePlaceholder')}
                required
                maxLength={128}
              />
            </div>
            <div className='grid grid-cols-2 gap-4'>
              <div className='grid gap-2'>
                <Label htmlFor='supply-category'>
                  {t('officeSupplies.fields.category')} *
                </Label>
                <Input
                  id='supply-category'
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder={t('officeSupplies.form.categoryPlaceholder')}
                  required
                  maxLength={32}
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='supply-unit'>
                  {t('officeSupplies.fields.unit')} *
                </Label>
                <Input
                  id='supply-unit'
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  placeholder={t('officeSupplies.form.unitPlaceholder')}
                  required
                  maxLength={16}
                />
              </div>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='supply-quantity'>
                {t('officeSupplies.fields.quantity')} *
              </Label>
              <Input
                id='supply-quantity'
                type='number'
                min={0}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='supply-remark'>
                {t('officeSupplies.fields.remark')}
              </Label>
              <Textarea
                id='supply-remark'
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                placeholder={t('officeSupplies.form.remarkPlaceholder')}
                rows={3}
              />
            </div>
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
              {editing ? t('officeSupplies.save') : t('officeSupplies.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
