import { useTranslation } from '@nocobase/i18n/client';
import { useRef, useState, type FormEvent, type ReactElement } from 'react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import {
  ASSET_STATUSES,
  ASSET_TYPES,
  type Asset,
  type AssetInput,
} from './asset-types.js';
import {
  assetStatusKey,
  assetTypeKey,
  toDateInputValue,
} from './asset-label-utils.js';

export interface AssetFormDialogProps {
  readonly open: boolean;
  readonly asset: Asset | null;
  readonly submitting: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: AssetInput) => void | Promise<void>;
}

export function AssetFormDialog({
  open,
  asset,
  submitting,
  onOpenChange,
  onSubmit,
}: AssetFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const editing = asset !== null;

  const [assetNumber, setAssetNumber] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('computer');
  const [brandModel, setBrandModel] = useState('');
  const [status, setStatus] = useState('available');
  const [purchasedAt, setPurchasedAt] = useState('');
  const [remark, setRemark] = useState('');
  // The date input is controlled, so a value written straight to the DOM (e.g.
  // by automation) never reaches React state. Read the live DOM value on
  // submit as a fallback so such a date is still persisted.
  const purchasedAtRef = useRef<HTMLInputElement>(null);

  // Re-seed the form whenever the dialog opens for a different asset.
  const [lastKey, setLastKey] = useState<string>('');
  const key = `${open ? 'open' : 'closed'}:${asset?.id ?? 'new'}`;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setAssetNumber(asset?.assetNumber ?? '');
      setName(asset?.name ?? '');
      setType(asset?.type ?? 'computer');
      setBrandModel(asset?.brandModel ?? '');
      setStatus(asset?.status ?? 'available');
      setPurchasedAt(toDateInputValue(asset?.purchasedAt));
      setRemark(asset?.remark ?? '');
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const domPurchasedAt = purchasedAtRef.current?.value ?? '';
    void onSubmit({
      assetNumber: assetNumber.trim(),
      name: name.trim(),
      type,
      brandModel: brandModel.trim(),
      status,
      purchasedAt: purchasedAt || domPurchasedAt || null,
      remark: remark.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {editing ? t('assets.editTitle') : t('assets.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? t('assets.editDescription')
              : t('assets.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <form className='grid gap-4' onSubmit={handleSubmit}>
          <div className='grid grid-cols-2 gap-4'>
            <div className='grid gap-1.5'>
              <Label htmlFor='asset-number'>
                {t('assets.assetNumberLabel')}
              </Label>
              <Input
                id='asset-number'
                required
                value={assetNumber}
                onChange={(event) => setAssetNumber(event.target.value)}
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='asset-name'>{t('assets.nameLabel')}</Label>
              <Input
                id='asset-name'
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className='grid gap-1.5'>
              <Label>{t('assets.typeLabel')}</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value ?? '')}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(assetTypeKey(value))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-1.5'>
              <Label>{t('assets.statusLabel')}</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value ?? '')}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(assetStatusKey(value))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='asset-brand-model'>
                {t('assets.brandModelLabel')}
              </Label>
              <Input
                id='asset-brand-model'
                required
                value={brandModel}
                onChange={(event) => setBrandModel(event.target.value)}
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='asset-purchased-at'>
                {t('assets.purchasedAtLabel')}
              </Label>
              <Input
                id='asset-purchased-at'
                ref={purchasedAtRef}
                type='date'
                value={purchasedAt}
                onChange={(event) => setPurchasedAt(event.target.value)}
              />
            </div>
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='asset-remark'>{t('assets.remarkLabel')}</Label>
            <Textarea
              id='asset-remark'
              rows={3}
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder={t('assets.remarkPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button type='submit' disabled={submitting}>
              {submitting ? t('assets.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
