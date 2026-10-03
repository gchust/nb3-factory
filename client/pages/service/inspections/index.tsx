import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useServiceApi,
  type InspectionView,
  type ServiceApi,
} from '@/lib/service-api';
import { useAsync } from '@/lib/use-async';

import { ErrorBlock, InspectionStatusBadge, LoadingBlock } from '../shared.js';
import { formatDate, formatDateTime } from '../format.js';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export default function InspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const [status, setStatus] = useState('all');
  const inspections = useAsync(
    () => api.inspections(status === 'all' ? undefined : status),
    [api, status],
  );
  const me = useAsync(() => api.me(), [api]);
  const canManage = me.data?.can.manageInspections ?? false;
  const [running, setRunning] = useState(false);
  const [completing, setCompleting] = useState<InspectionView | null>(null);

  async function runNow(): Promise<void> {
    setRunning(true);
    try {
      const result = await api.generateInspections();
      toaster.show({
        type: 'success',
        title: t('service.inspection.runResult', {
          created: result.created,
          skipped: result.skipped,
          reminders: result.reminders,
        }),
      });
      inspections.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.inspection.runFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setRunning(false);
    }
  }

  const columns = useMemo<ColumnDef<InspectionView>[]>(
    () => [
      {
        id: 'device',
        header: t('service.inspection.device'),
        cell: ({ row }) =>
          row.original.device
            ? `${row.original.device.deviceNo} · ${row.original.device.name}`
            : `#${row.original.deviceId}`,
      },
      {
        accessorKey: 'planDate',
        header: t('service.inspection.planDate'),
        cell: ({ row }) => formatDate(row.original.planDate),
      },
      {
        accessorKey: 'status',
        header: t('service.inspection.status.label'),
        cell: ({ row }) => (
          <InspectionStatusBadge status={row.original.status} />
        ),
      },
      {
        accessorKey: 'result',
        header: t('service.inspection.result'),
        cell: ({ row }) => (
          <span className='line-clamp-1 text-muted-foreground'>
            {row.original.result ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'completedAt',
        header: t('service.inspection.completedAt'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatDateTime(row.original.completedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.status === 'completed' ? null : (
            <Button
              size='xs'
              variant='ghost'
              onClick={(event) => {
                event.stopPropagation();
                setCompleting(row.original);
              }}
            >
              {t('service.inspection.complete')}
            </Button>
          ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.inspection.title')}
        description={t('service.inspection.description')}
        actions={
          <div className='flex items-center gap-2'>
            {canManage ? (
              <Button
                size='sm'
                variant='outline'
                disabled={running}
                onClick={() => void runNow()}
              >
                {running
                  ? t('service.inspection.running')
                  : t('service.inspection.runNow')}
              </Button>
            ) : null}
            <Select
              value={status}
              onValueChange={(value) => setStatus(String(value))}
            >
              <SelectTrigger className='w-40'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  {t('service.inspection.status.all')}
                </SelectItem>
                <SelectItem value='pending'>
                  {t('service.inspection.status.pending')}
                </SelectItem>
                <SelectItem value='overdue'>
                  {t('service.inspection.status.overdue')}
                </SelectItem>
                <SelectItem value='completed'>
                  {t('service.inspection.status.completed')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />
      {inspections.error ? (
        <ErrorBlock error={inspections.error} onRetry={inspections.reload} />
      ) : !inspections.data ? (
        <LoadingBlock />
      ) : (
        <DataTable
          columns={columns}
          data={inspections.data}
          getRowId={(row) => String(row.id)}
          emptyMessage={t('service.inspection.empty')}
        />
      )}
      <CompleteDialog
        api={api}
        t={t}
        inspection={completing}
        onClose={() => setCompleting(null)}
        onDone={() => inspections.reload()}
      />
    </PageContainer>
  );
}

function CompleteDialog({
  api,
  t,
  inspection,
  onClose,
  onDone,
}: {
  api: ServiceApi;
  t: Translate;
  inspection: InspectionView | null;
  onClose: () => void;
  onDone: () => void;
}): ReactElement | null {
  const toaster = useToaster();
  const [result, setResult] = useState('');

  if (!inspection) {
    return null;
  }

  async function complete(): Promise<void> {
    try {
      await api.completeInspection(inspection!.id, result.trim());
      toaster.show({
        type: 'success',
        title: t('service.inspection.completed'),
      });
      setResult('');
      onClose();
      onDone();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.inspection.completeFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('service.inspection.complete')}</DialogTitle>
          <DialogDescription>
            {inspection.device
              ? `${inspection.device.deviceNo} · ${inspection.device.name}`
              : `#${inspection.deviceId}`}{' '}
            · {formatDate(inspection.planDate)}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='py-2'>
          <Field>
            <FieldLabel htmlFor='inspection-result'>
              {t('service.inspection.result')}
            </FieldLabel>
            <Textarea
              id='inspection-result'
              rows={4}
              value={result}
              onChange={(event) => setResult(event.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant='outline' type='button' onClick={onClose}>
            {t('service.common.cancel')}
          </Button>
          <Button
            type='button'
            disabled={!result.trim()}
            onClick={() => void complete()}
          >
            {t('service.common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
