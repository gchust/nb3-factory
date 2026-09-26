import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';

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

import { EquipmentForm } from './equipment-form.js';
import type { EquipmentItem } from './types.js';

export interface EquipmentDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Omit it to create; pass the row to edit. */
  readonly equipment?: EquipmentItem;
  readonly onSubmitted: (equipment: EquipmentItem) => void;
  /** Called when the edited record was deleted elsewhere, so the list refreshes. */
  readonly onReload?: () => void;
}

const FORM_ID = 'equipment-editor-form';

/** Container for the create/edit equipment form. */
export function EquipmentDialog({
  open,
  onOpenChange,
  equipment,
  onSubmitted,
  onReload,
}: EquipmentDialogProps): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [gone, setGone] = useState(false);
  const submittingRef = useRef(false);

  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submittingRef.current) return;
        // Reset the not-found notice when the dialog closes so the next open
        // starts from a clean form.
        if (!next) setGone(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {equipment
              ? t('equipment.edit.title')
              : t('equipment.create.title')}
          </DialogTitle>
          <DialogDescription>
            {equipment
              ? t('equipment.edit.description')
              : t('equipment.create.description')}
          </DialogDescription>
        </DialogHeader>
        {gone ? (
          <p className='py-4 text-sm text-muted-foreground'>
            {t('equipment.error.notFound')}
          </p>
        ) : (
          <EquipmentForm
            equipment={equipment}
            formId={FORM_ID}
            onSubmitted={onSubmitted}
            onSubmittingChange={handleSubmittingChange}
            onNotFound={() => {
              setGone(true);
              onReload?.();
            }}
          />
        )}
        <DialogFooter>
          {gone ? (
            <Button type='button' onClick={() => onOpenChange(false)}>
              {t('actions.close')}
            </Button>
          ) : (
            <>
              <Button
                type='button'
                variant='outline'
                disabled={submitting}
                onClick={() => onOpenChange(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit' form={FORM_ID} disabled={submitting}>
                {submitting ? <Spinner data-icon='inline-start' /> : null}
                {submitting
                  ? t('actions.saving')
                  : equipment
                    ? t('actions.save')
                    : t('equipment.create.action')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
