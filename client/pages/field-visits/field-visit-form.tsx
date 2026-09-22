import { useTranslation } from '@nocobase/i18n/client';
import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import {
  FIELD_VISIT_CONCLUSIONS,
  toFieldVisitDraft,
  type FieldVisit,
  type FieldVisitConclusion,
  type FieldVisitDraft,
} from './api.js';
import {
  MAX_CUSTOMER_NAME_LENGTH,
  validateFieldVisitDraft,
  type FieldVisitFieldErrors,
} from './validation.js';

export interface FieldVisitFormDialogProps {
  readonly record: FieldVisit | null;
  readonly onClose: () => void;
  readonly onSubmit: (draft: FieldVisitDraft) => Promise<void>;
}

export function FieldVisitFormDialog({
  onClose,
  onSubmit,
  record,
}: FieldVisitFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<FieldVisitDraft>(() =>
    toFieldVisitDraft(record),
  );
  const [errors, setErrors] = useState<FieldVisitFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const customerNameId = useId();
  const visitDateId = useId();
  const conclusionId = useId();
  const engineerNameId = useId();
  const notesId = useId();
  const requiredMessage = t('fieldVisits.required');

  function update<K extends keyof FieldVisitDraft>(
    key: K,
    value: FieldVisitDraft[K],
  ): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const nextErrors = validateFieldVisitDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSaving(true);
    setSaveFailed(false);
    try {
      await onSubmit(draft);
      onClose();
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <form
          noValidate
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {record
                ? t('fieldVisits.editTitle')
                : t('fieldVisits.createTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className='grid gap-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor={customerNameId}>
                {t('fieldVisits.customerName')}
                <span className='text-destructive'>*</span>
              </Label>
              <Input
                aria-invalid={errors.customerName ? true : undefined}
                id={customerNameId}
                maxLength={MAX_CUSTOMER_NAME_LENGTH}
                onChange={(event) => update('customerName', event.target.value)}
                required
                value={draft.customerName}
              />
              {errors.customerName ? (
                <p className='text-sm text-destructive'>
                  {t(errors.customerName)}
                </p>
              ) : null}
            </div>

            <div className='grid gap-2'>
              <Label htmlFor={visitDateId}>
                {t('fieldVisits.visitDate')}
                <span className='text-destructive'>*</span>
              </Label>
              <Input
                aria-invalid={errors.visitDate ? true : undefined}
                id={visitDateId}
                onChange={(event) => update('visitDate', event.target.value)}
                required
                type='date'
                value={draft.visitDate}
              />
              {errors.visitDate ? (
                <p className='text-sm text-destructive'>
                  {t(errors.visitDate)}
                </p>
              ) : null}
            </div>

            <div className='grid gap-2'>
              <Label htmlFor={conclusionId}>
                {t('fieldVisits.conclusion')}
                <span className='text-destructive'>*</span>
              </Label>
              <Select
                onValueChange={(value) => update('conclusion', value ?? '')}
                value={draft.conclusion}
              >
                <SelectTrigger
                  aria-invalid={errors.conclusion ? true : undefined}
                  className='w-full'
                  id={conclusionId}
                >
                  <SelectValue
                    placeholder={t('fieldVisits.conclusionPlaceholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_VISIT_CONCLUSIONS.map(
                    (conclusion: FieldVisitConclusion) => (
                      <SelectItem key={conclusion} value={conclusion}>
                        {t(`fieldVisits.conclusions.${conclusion}`)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              {errors.conclusion ? (
                <p className='text-sm text-destructive'>
                  {t(errors.conclusion)}
                </p>
              ) : null}
            </div>

            <div className='grid gap-2'>
              <Label htmlFor={engineerNameId}>
                {t('fieldVisits.engineerName')}
              </Label>
              <Input
                id={engineerNameId}
                onChange={(event) => update('engineerName', event.target.value)}
                value={draft.engineerName}
              />
            </div>

            <div className='grid gap-2'>
              <Label htmlFor={notesId}>{t('fieldVisits.notes')}</Label>
              <Textarea
                id={notesId}
                onChange={(event) => update('notes', event.target.value)}
                rows={3}
                value={draft.notes}
              />
            </div>

            {saveFailed ? (
              <p className='text-sm text-destructive'>
                {t('fieldVisits.saveFailed')}
              </p>
            ) : null}
            <p className='text-xs text-muted-foreground'>{requiredMessage}</p>
          </div>

          <DialogFooter>
            <Button
              disabled={saving}
              onClick={onClose}
              type='button'
              variant='outline'
            >
              {t('actions.cancel')}
            </Button>
            <Button disabled={saving} type='submit'>
              {saving ? <Spinner /> : null}
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
