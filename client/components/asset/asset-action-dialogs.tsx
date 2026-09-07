import { useTranslation } from '@nocobase/i18n/client';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import type { Asset, Employee } from './asset-types.js';

export interface ClaimDialogProps {
  readonly open: boolean;
  readonly asset: Asset | null;
  readonly employees: readonly Employee[];
  readonly submitting: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (
    employeeId: number,
    remark: string | null,
  ) => void | Promise<void>;
}

export function ClaimDialog({
  open,
  asset,
  employees,
  submitting,
  onOpenChange,
  onSubmit,
}: ClaimDialogProps): ReactElement {
  const { t } = useTranslation();
  const [employeeId, setEmployeeId] = useState<string>('');
  const [remark, setRemark] = useState('');

  const [lastKey, setLastKey] = useState('');
  const key = `${open ? 'open' : 'closed'}:${asset?.id ?? 'none'}`;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setEmployeeId('');
      setRemark('');
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const id = Number(employeeId);
    if (!Number.isInteger(id) || id <= 0) {
      return;
    }
    void onSubmit(id, remark.trim() || null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('assets.claimTitle')}</DialogTitle>
          <DialogDescription>
            {asset
              ? t('assets.claimDescription', { name: asset.name })
              : t('assets.claimDescription', { name: '' })}
          </DialogDescription>
        </DialogHeader>
        <form className='grid gap-4' onSubmit={handleSubmit}>
          <div className='grid gap-1.5'>
            <Label>{t('assets.employeeLabel')}</Label>
            <Select
              value={employeeId}
              onValueChange={(value) => setEmployeeId(value ?? '')}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={t('assets.selectEmployee')} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={String(employee.id)}>
                    {employee.name} · {employee.department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='claim-remark'>{t('assets.remarkLabel')}</Label>
            <Textarea
              id='claim-remark'
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
            <Button type='submit' disabled={submitting || !employeeId}>
              {submitting ? t('assets.saving') : t('assets.claim')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface ReturnDialogProps {
  readonly open: boolean;
  readonly asset: Asset | null;
  readonly submitting: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (remark: string | null) => void | Promise<void>;
}

export function ReturnDialog({
  open,
  asset,
  submitting,
  onOpenChange,
  onSubmit,
}: ReturnDialogProps): ReactElement {
  const { t } = useTranslation();
  const [remark, setRemark] = useState('');

  const [lastKey, setLastKey] = useState('');
  const key = `${open ? 'open' : 'closed'}:${asset?.id ?? 'none'}`;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setRemark('');
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    void onSubmit(remark.trim() || null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('assets.returnTitle')}</DialogTitle>
          <DialogDescription>
            {asset
              ? t('assets.returnDescription', { name: asset.name })
              : t('assets.returnDescription', { name: '' })}
          </DialogDescription>
        </DialogHeader>
        <form className='grid gap-4' onSubmit={handleSubmit}>
          <div className='grid gap-1.5'>
            <Label htmlFor='return-remark'>{t('assets.remarkLabel')}</Label>
            <Textarea
              id='return-remark'
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
              {submitting ? t('assets.saving') : t('assets.return')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface DeleteDialogProps {
  readonly open: boolean;
  readonly asset: Asset | null;
  readonly submitting: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void | Promise<void>;
}

export function DeleteDialog({
  open,
  asset,
  submitting,
  onOpenChange,
  onConfirm,
}: DeleteDialogProps): ReactElement {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('assets.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {asset
              ? t('assets.deleteConfirm', { name: asset.name })
              : t('assets.deleteConfirm', { name: '' })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            type='button'
            variant='destructive'
            disabled={submitting}
            onClick={() => void onConfirm()}
          >
            {submitting ? t('assets.deleting') : t('assets.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
