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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { EquipmentStatusBadge } from './equipment-status-badge.js';
import type {
  EquipmentCreatePayload,
  EquipmentListItem,
  EquipmentUpdatePayload,
} from './types.js';

export interface EquipmentFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The equipment being edited, or null to create a new one. */
  readonly equipment: EquipmentListItem | null;
  /** Categories seen elsewhere in the ledger, offered as suggestions. */
  readonly categories: readonly string[];
  readonly onSubmit: (
    payload: EquipmentCreatePayload | EquipmentUpdatePayload,
  ) => Promise<void>;
}

/**
 * Shared create/edit dialog for the equipment ledger. For an edit it shows the
 * current status read-only, because status is owned by the borrow/return and
 * repair workflow rather than free-form editing.
 */
export function EquipmentFormDialog({
  open,
  onOpenChange,
  equipment,
  categories,
  onSubmit,
}: EquipmentFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const isEditing = equipment !== null;
  const [name, setName] = useState('');
  const [assetNumber, setAssetNumber] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setName(equipment?.name ?? '');
    setAssetNumber(equipment?.assetNumber ?? '');
    setCategory(equipment?.category ?? '');
    setDescription(equipment?.description ?? '');
    setError(null);
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (
      name.trim().length === 0 ||
      assetNumber.trim().length === 0 ||
      category.trim().length === 0
    ) {
      setError(t('equipment.errors.unexpected'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: EquipmentCreatePayload | EquipmentUpdatePayload = isEditing
        ? {
            name: name.trim(),
            assetNumber: assetNumber.trim(),
            category: category.trim(),
            description:
              description.trim().length > 0 ? description.trim() : null,
          }
        : {
            name: name.trim(),
            assetNumber: assetNumber.trim(),
            category: category.trim(),
            description:
              description.trim().length > 0 ? description.trim() : null,
          };
      await onSubmit(payload);
      onOpenChange(false);
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
          reset();
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t('equipment.dialog.editTitle')
              : t('equipment.dialog.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? (
              <span className='flex items-center gap-2'>
                {equipment?.assetNumber}
                <EquipmentStatusBadge
                  status={equipment?.status ?? 'available'}
                />
              </span>
            ) : (
              t('equipment.dialog.statusHint')
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className='space-y-2'>
            <Label htmlFor='equipment-name'>{t('equipment.fields.name')}</Label>
            <Input
              autoFocus
              id='equipment-name'
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='equipment-asset-number'>
              {t('equipment.fields.assetNumber')}
            </Label>
            <Input
              id='equipment-asset-number'
              onChange={(event) => setAssetNumber(event.target.value)}
              value={assetNumber}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='equipment-category'>
              {t('equipment.fields.category')}
            </Label>
            <Input
              id='equipment-category'
              list='equipment-categories'
              onChange={(event) => setCategory(event.target.value)}
              value={category}
            />
            <datalist id='equipment-categories'>
              {categories.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='equipment-description'>
              {t('equipment.fields.description')}
            </Label>
            <Textarea
              id='equipment-description'
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              value={description}
            />
          </div>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          <DialogFooter showCloseButton>
            <Button disabled={submitting} type='submit'>
              {submitting ? <Loader2 className='animate-spin' /> : null}
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
