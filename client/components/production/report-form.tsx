import { useMemo, useState, type FormEvent, type ReactElement } from 'react';
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
  calculateHours,
  productionApi,
  type ProcessProgress,
} from '@/lib/production-api';
import { translateError } from '@/lib/production-messages';

export interface ReportFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly api: ApiClient;
  readonly workOrderId: number;
  readonly processes: readonly ProcessProgress[];
  readonly standardMinutes: number;
  readonly onCreated: () => void;
}

export function ReportFormDialog({
  open,
  onOpenChange,
  api,
  workOrderId,
  processes,
  standardMinutes,
  onCreated,
}: ReportFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const [processId, setProcessId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [qualifiedQuantity, setQualifiedQuantity] = useState('');
  const [defectQuantity, setDefectQuantity] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const selected = useMemo(
    () => processes.find((process) => String(process.id) === processId),
    [processes, processId],
  );

  const previewHours =
    Number(quantity) > 0
      ? calculateHours(Number(quantity), standardMinutes)
      : 0;

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    const reported = Number(quantity);
    const qualified = Number(qualifiedQuantity);
    const defect = Number(defectQuantity);
    if (!selected) {
      setError(t('production.workOrders.reportSelectProcess'));
      return;
    }
    if (!(reported > 0) || qualified < 0 || defect < 0) {
      setError(t('production.errors.INVALID_QUANTITY'));
      return;
    }
    if (qualified + defect !== reported) {
      setError(t('production.errors.REPORT_QUANTITY_MISMATCH'));
      return;
    }
    if (reported > selected.remainingQuantity) {
      setError(
        t('production.errors.REPORT_EXCEEDS_REMAINING', {
          defaultValue: `Exceeds remaining ${selected.remainingQuantity}`,
        }),
      );
      return;
    }
    setPending(true);
    try {
      await productionApi.createReport(api, workOrderId, {
        processId: selected.id,
        quantity: reported,
        qualifiedQuantity: qualified,
        defectQuantity: defect,
      });
      onCreated();
      onOpenChange(false);
      setQuantity('');
      setQualifiedQuantity('');
      setDefectQuantity('');
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
          <DialogTitle>{t('production.workOrders.reportTitle')}</DialogTitle>
          <DialogDescription>
            {t('production.workOrders.reportDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className='space-y-2'>
            <Label htmlFor='report-process'>
              {t('production.workOrders.reportProcess')}
            </Label>
            <SelectField
              id='report-process'
              onValueChange={setProcessId}
              options={processes.map((process) => ({
                value: String(process.id),
                label: `${process.sequence}. ${process.name} · ${t('production.workOrders.remaining')} ${process.remainingQuantity}`,
              }))}
              placeholder={t('production.workOrders.reportSelectProcess')}
              value={processId}
            />
            {selected ? (
              <p className='text-xs text-muted-foreground'>
                {t('production.workOrders.plannedQuantity')}:{' '}
                {selected.plannedQuantity} ·{' '}
                {t('production.workOrders.remaining')}:{' '}
                {selected.remainingQuantity}
              </p>
            ) : null}
          </div>
          <div className='space-y-2'>
            <Label htmlFor='report-quantity'>
              {t('production.workOrders.reportQuantity')}
            </Label>
            <Input
              id='report-quantity'
              min='1'
              onChange={(event) => setQuantity(event.target.value)}
              type='number'
              value={quantity}
            />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='report-qualified'>
                {t('production.workOrders.qualifiedQuantity')}
              </Label>
              <Input
                id='report-qualified'
                min='0'
                onChange={(event) => setQualifiedQuantity(event.target.value)}
                type='number'
                value={qualifiedQuantity}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='report-defect'>
                {t('production.workOrders.defectQuantity')}
              </Label>
              <Input
                id='report-defect'
                min='0'
                onChange={(event) => setDefectQuantity(event.target.value)}
                type='number'
                value={defectQuantity}
              />
            </div>
          </div>
          <div className='rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm'>
            <span className='text-muted-foreground'>
              {t('production.workOrders.estimatedHours')}:
            </span>{' '}
            <span className='font-medium'>{previewHours.toFixed(1)}</span>
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
              {t('production.workOrders.submitReport')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
