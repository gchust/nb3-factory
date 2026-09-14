import { useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import type { ApiClient } from '@nocobase/app-client';

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
import { SelectField } from '@/components/production/select-field';
import {
  productionApi,
  type DefectDisposition,
  type DefectReason,
  type WorkReport,
} from '@/lib/production-api';
import { translateError } from '@/lib/production-messages';

const REASONS: readonly DefectReason[] = [
  'size_deviation',
  'appearance_defect',
  'material_issue',
  'equipment_failure',
];

const DISPOSITIONS: readonly DefectDisposition[] = ['rework', 'scrap'];

export interface DefectFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly api: ApiClient;
  readonly workOrderId: number;
  readonly report: WorkReport | null;
  readonly onCreated: () => void;
}

export function DefectFormDialog({
  open,
  onOpenChange,
  api,
  workOrderId,
  report,
  onCreated,
}: DefectFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [disposition, setDisposition] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const remaining = report
    ? report.defectQuantity - report.registeredDefectQuantity
    : 0;

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    if (!report) return;
    const value = Number(quantity);
    if (!(value > 0)) {
      setError(t('production.errors.INVALID_QUANTITY'));
      return;
    }
    if (value > remaining) {
      setError(
        t('production.errors.DEFECT_EXCEEDS_REPORT', {
          defaultValue: `Exceeds remaining ${remaining}`,
        }),
      );
      return;
    }
    if (!reason || !disposition) {
      setError(t('production.workOrders.defectFormIncomplete'));
      return;
    }
    setPending(true);
    try {
      await productionApi.createDefect(api, workOrderId, {
        workReportId: report.id,
        quantity: value,
        reason: reason as DefectReason,
        disposition: disposition as DefectDisposition,
      });
      onCreated();
      onOpenChange(false);
      setQuantity('');
      setReason(null);
      setDisposition(null);
    } catch (submitError) {
      setError(translateError(t, submitError));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('production.workOrders.defectTitle')}</DialogTitle>
          <DialogDescription>
            {t('production.workOrders.defectDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          {report ? (
            <p className='text-sm text-muted-foreground'>
              {report.processName} · {t('production.workOrders.defectQuantity')}{' '}
              {report.defectQuantity} · {t('production.workOrders.remaining')}{' '}
              {remaining}
            </p>
          ) : null}
          <div className='space-y-2'>
            <Label htmlFor='defect-quantity'>
              {t('production.workOrders.defectQuantity')}
            </Label>
            <Input
              id='defect-quantity'
              min='1'
              onChange={(event) => setQuantity(event.target.value)}
              type='number'
              value={quantity}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='defect-reason'>
              {t('production.workOrders.defectReason')}
            </Label>
            <SelectField
              id='defect-reason'
              onValueChange={setReason}
              options={REASONS.map((value) => ({
                value,
                label: t(`production.reason.${value}`, { defaultValue: value }),
              }))}
              placeholder={t('production.workOrders.selectReason')}
              value={reason}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='defect-disposition'>
              {t('production.workOrders.defectDisposition')}
            </Label>
            <SelectField
              id='defect-disposition'
              onValueChange={setDisposition}
              options={DISPOSITIONS.map((value) => ({
                value,
                label: t(`production.disposition.${value}`, {
                  defaultValue: value,
                }),
              }))}
              placeholder={t('production.workOrders.selectDisposition')}
              value={disposition}
            />
          </div>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type='button'
              variant='outline'
            >
              {t('production.common.cancel')}
            </Button>
            <Button disabled={pending} type='submit'>
              {t('production.workOrders.submitDefect')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
