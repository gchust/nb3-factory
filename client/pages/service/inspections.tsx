import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClockIcon, PlayIcon, RefreshCwIcon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

import {
  EmptyState,
  ErrorState,
  InspectionStatusBadge,
  LoadingState,
} from './components.js';
import {
  completeInspection,
  errorMessage,
  flagOverdueInspections,
  formatDate,
  generateInspections,
  getDirectory,
  listEquipment,
  listInspections,
  type DirectoryProfile,
  type Equipment,
  type Inspection,
} from './data.js';

export default function InspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [rows, setRows] = useState<Inspection[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [engineers, setEngineers] = useState<DirectoryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [completing, setCompleting] = useState<Inspection>();
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listInspections(api),
      listEquipment(api),
      getDirectory(api).catch(() => ({ groups: [], profiles: [] })),
    ])
      .then(([page, equipmentPage, directory]) => {
        if (controller.signal.aborted) return;
        setRows(page.items);
        setEquipment(equipmentPage.items);
        setEngineers(directory.profiles);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause));
        setLoading(false);
      });
    return () => controller.abort();
  }, [api, revision]);

  const equipmentById = new Map(
    equipment.map((item) => [item.id, `${item.code} · ${item.name}`]),
  );
  const nameById = new Map(
    engineers.map((engineer) => [engineer.userId, engineer.name]),
  );

  const runGenerate = async (): Promise<void> => {
    setBusy(true);
    try {
      const outcome = await generateInspections(api);
      toaster.show({
        type: 'success',
        title: t('service.inspections.generated', { count: outcome.created }),
      });
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const runOverdue = async (): Promise<void> => {
    setBusy(true);
    try {
      const outcome = await flagOverdueInspections(api);
      toaster.show({
        type: 'success',
        title: t('service.inspections.overdueDone', {
          count: outcome.notified,
        }),
      });
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const complete = async (): Promise<void> => {
    if (!completing) return;
    setBusy(true);
    try {
      await completeInspection(api, completing.id, result);
      toaster.show({
        type: 'success',
        title: t('service.inspections.completed'),
      });
      setCompleting(undefined);
      setResult('');
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnDef<Inspection>[] = [
    {
      accessorKey: 'code',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('service.inspections.code')}
        />
      ),
      cell: ({ row }) => (
        <span className='font-mono text-xs'>
          {row.original.code ?? `#${row.original.id}`}
        </span>
      ),
    },
    {
      accessorKey: 'equipmentId',
      header: t('service.inspections.equipment'),
      cell: ({ row }) =>
        equipmentById.get(row.original.equipmentId) ??
        `#${row.original.equipmentId}`,
    },
    {
      accessorKey: 'planDate',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('service.inspections.planDate')}
        />
      ),
      cell: ({ row }) => formatDate(row.original.planDate),
    },
    {
      accessorKey: 'dueDate',
      header: t('service.inspections.dueDate'),
      cell: ({ row }) => formatDate(row.original.dueDate),
    },
    {
      accessorKey: 'assigneeId',
      header: t('service.inspections.assignee'),
      cell: ({ row }) =>
        row.original.assigneeId
          ? (nameById.get(row.original.assigneeId) ?? row.original.assigneeId)
          : t('service.workOrders.unassigned'),
    },
    {
      accessorKey: 'status',
      header: t('service.inspections.status'),
      cell: ({ row }) => <InspectionStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'result',
      header: t('service.inspections.result'),
      cell: ({ row }) => row.original.result ?? '—',
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        row.original.status === 'pending' ||
        row.original.status === 'overdue' ? (
          <div className='flex justify-end'>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setCompleting(row.original)}
            >
              {t('service.inspections.complete')}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('service.inspections.title')}
        description={t('service.inspections.description')}
        actions={
          <>
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => void runOverdue()}
            >
              <CalendarClockIcon />
              {t('service.inspections.runOverdue')}
            </Button>
            <Button disabled={busy} onClick={() => void runGenerate()}>
              <PlayIcon />
              {t('service.inspections.runGenerate')}
            </Button>
          </>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('service.inspections.emptyTitle')}
          description={t('service.inspections.emptyDescription')}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
        />
      )}

      <p className='flex items-center gap-2 text-xs text-muted-foreground'>
        <RefreshCwIcon className='size-3' />
        {t('service.inspections.schedulerHint')}
      </p>

      <Dialog
        open={completing !== undefined}
        onOpenChange={(open) => {
          if (!open) setCompleting(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('service.inspections.complete')}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='inspection-result'>
                {t('service.inspections.result')}
              </FieldLabel>
              <Textarea
                id='inspection-result'
                rows={3}
                value={result}
                onChange={(event) => setResult(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant='outline' onClick={() => setCompleting(undefined)}>
              {t('actions.cancel')}
            </Button>
            <Button disabled={busy || !result} onClick={() => void complete()}>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
