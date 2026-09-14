import { useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import type { ApiClient } from '@nocobase/app-client';
import { PlusIcon, Trash2Icon } from 'lucide-react';

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
import { productionApi, type Product, type Team } from '@/lib/production-api';
import { translateError } from '@/lib/production-messages';

interface ProcessDraft {
  id: string;
  name: string;
  plannedQuantity: string;
}

let processDraftId = 0;

function newProcessDraft(): ProcessDraft {
  processDraftId += 1;
  return { id: `process-${processDraftId}`, name: '', plannedQuantity: '' };
}

export interface WorkOrderFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly api: ApiClient;
  readonly products: readonly Product[];
  readonly teams: readonly Team[];
  readonly onCreated: (workOrder: { id: number; code: string }) => void;
}

function defaultCode(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `WO-${stamp}-${suffix}`;
}

export function WorkOrderFormDialog({
  open,
  onOpenChange,
  api,
  products,
  teams,
  onCreated,
}: WorkOrderFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const [code, setCode] = useState(defaultCode);
  const [productId, setProductId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [plannedQuantity, setPlannedQuantity] = useState('');
  const [plannedStartDate, setPlannedStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');
  const [processes, setProcesses] = useState<ProcessDraft[]>(() => [
    newProcessDraft(),
    newProcessDraft(),
  ]);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const updateProcess = (index: number, patch: Partial<ProcessDraft>): void => {
    setProcesses((current) =>
      current.map((process, position) =>
        position === index ? { ...process, ...patch } : process,
      ),
    );
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    const filled = processes.filter(
      (process) => process.name.trim() && process.plannedQuantity.trim(),
    );
    if (!productId || !teamId || !(Number(plannedQuantity) > 0)) {
      setError(t('production.workOrders.formIncomplete'));
      return;
    }
    if (filled.length === 0) {
      setError(t('production.workOrders.processRequired'));
      return;
    }
    setPending(true);
    try {
      const created = await productionApi.createWorkOrder(api, {
        code: code.trim() || undefined,
        productId: Number(productId),
        teamId: Number(teamId),
        plannedQuantity: Number(plannedQuantity),
        plannedStartDate: plannedStartDate || null,
        plannedEndDate: plannedEndDate || null,
        processes: filled.map((process) => ({
          name: process.name.trim(),
          plannedQuantity: Number(process.plannedQuantity),
        })),
      });
      onCreated(created);
      onOpenChange(false);
    } catch (submitError) {
      setError(translateError(t, submitError));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('production.workOrders.createTitle')}</DialogTitle>
          <DialogDescription>
            {t('production.workOrders.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className='space-y-2'>
            <Label htmlFor='work-order-code'>
              {t('production.workOrders.code')}
            </Label>
            <Input
              id='work-order-code'
              onChange={(event) => setCode(event.target.value)}
              value={code}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='work-order-product'>
              {t('production.workOrders.product')}
            </Label>
            <SelectField
              id='work-order-product'
              onValueChange={setProductId}
              options={products.map((product) => ({
                value: String(product.id),
                label: `${product.name} (${product.code})`,
              }))}
              placeholder={t('production.workOrders.selectProduct')}
              value={productId}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='work-order-team'>
              {t('production.workOrders.team')}
            </Label>
            <SelectField
              id='work-order-team'
              onValueChange={setTeamId}
              options={teams.map((team) => ({
                value: String(team.id),
                label: team.name,
              }))}
              placeholder={t('production.workOrders.selectTeam')}
              value={teamId}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='work-order-quantity'>
              {t('production.workOrders.plannedQuantity')}
            </Label>
            <Input
              id='work-order-quantity'
              min='1'
              onChange={(event) => setPlannedQuantity(event.target.value)}
              type='number'
              value={plannedQuantity}
            />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='work-order-start'>
                {t('production.workOrders.plannedStartDate')}
              </Label>
              <Input
                id='work-order-start'
                onChange={(event) => setPlannedStartDate(event.target.value)}
                type='date'
                value={plannedStartDate}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='work-order-end'>
                {t('production.workOrders.plannedEndDate')}
              </Label>
              <Input
                id='work-order-end'
                onChange={(event) => setPlannedEndDate(event.target.value)}
                type='date'
                value={plannedEndDate}
              />
            </div>
          </div>

          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <Label>{t('production.workOrders.processes')}</Label>
              <Button
                onClick={() =>
                  setProcesses((current) => [...current, newProcessDraft()])
                }
                size='sm'
                type='button'
                variant='outline'
              >
                <PlusIcon />
                {t('production.workOrders.addProcess')}
              </Button>
            </div>
            <div className='space-y-2'>
              {processes.map((process, index) => (
                <div className='flex items-end gap-2' key={process.id}>
                  <span className='pb-2 text-sm text-muted-foreground'>
                    {index + 1}
                  </span>
                  <div className='flex-1 space-y-1'>
                    <Input
                      aria-label={t('production.workOrders.processName')}
                      onChange={(event) =>
                        updateProcess(index, { name: event.target.value })
                      }
                      placeholder={t('production.workOrders.processName')}
                      value={process.name}
                    />
                  </div>
                  <div className='w-28 space-y-1'>
                    <Input
                      aria-label={t('production.workOrders.processQuantity')}
                      min='1'
                      onChange={(event) =>
                        updateProcess(index, {
                          plannedQuantity: event.target.value,
                        })
                      }
                      placeholder={t('production.workOrders.processQuantity')}
                      type='number'
                      value={process.plannedQuantity}
                    />
                  </div>
                  <Button
                    disabled={processes.length <= 1}
                    onClick={() =>
                      setProcesses((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                    size='icon'
                    type='button'
                    variant='ghost'
                  >
                    <Trash2Icon />
                    <span className='sr-only'>
                      {t('production.workOrders.removeProcess')}
                    </span>
                  </Button>
                </div>
              ))}
            </div>
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
              {t('production.common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
