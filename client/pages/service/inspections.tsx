import { useToaster, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
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
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

import {
  serviceRequest,
  useServiceResource,
  type Assignee,
  type Device,
  type Inspection,
  type ServicePrincipal,
} from './model.js';
import { ErrorState, LoadingState } from './shared.js';

export default function InspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const api = useApiClient();
  const inspections = useServiceResource<Inspection[]>('inspections');
  const devices = useServiceResource<Device[]>('devices');
  const assignees = useServiceResource<Assignee[]>('assignees');
  const principal = useServiceResource<ServicePrincipal>('me');

  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<Inspection | null>(null);
  const [pending, setPending] = useState(false);
  const [maintaining, setMaintaining] = useState(false);

  const isAdmin = principal.data?.roles.admin ?? false;

  const handleMaintenance = async (
    action: 'inspections/generate' | 'reminders/run',
    successKey: string,
  ): Promise<void> => {
    setMaintaining(true);
    try {
      const result = await serviceRequest<{ created: number }>(
        api,
        `maintenance/${action}`,
        { method: 'POST' },
      );
      toaster.show({
        type: 'success',
        title: t(successKey, { count: result.created }),
      });
      inspections.reload();
    } catch (cause) {
      toaster.show({
        type: 'error',
        title: t('service.maintenance.failed'),
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setMaintaining(false);
    }
  };

  const deviceNames = useMemo(
    () =>
      new Map((devices.data ?? []).map((device) => [device.id, device.name])),
    [devices.data],
  );
  const assigneeNames = useMemo(
    () =>
      new Map(
        (assignees.data ?? []).map((assignee) => [assignee.id, assignee.name]),
      ),
    [assignees.data],
  );

  const handleCreate = async (
    payload: Record<string, unknown>,
  ): Promise<void> => {
    setPending(true);
    try {
      await serviceRequest(api, 'inspections', {
        method: 'POST',
        json: payload,
      });
      toaster.show({ type: 'success', title: t('service.saved') });
      setCreating(false);
      inspections.reload();
    } catch (cause) {
      toaster.show({
        type: 'error',
        title: t('service.saveFailed'),
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setPending(false);
    }
  };

  const handleComplete = async (result: string): Promise<void> => {
    if (!completing) return;
    setPending(true);
    try {
      await serviceRequest(api, `inspections/${completing.id}/complete`, {
        method: 'POST',
        json: { result },
      });
      toaster.show({ type: 'success', title: t('service.saved') });
      setCompleting(null);
      inspections.reload();
    } catch (cause) {
      toaster.show({
        type: 'error',
        title: t('service.saveFailed'),
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setPending(false);
    }
  };

  const columns = useMemo<ColumnDef<Inspection>[]>(
    () => [
      {
        id: 'device',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.inspections.device')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>
            {deviceNames.get(row.original.deviceId) ?? row.original.deviceId}
          </span>
        ),
      },
      {
        accessorKey: 'plannedDate',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.inspections.plannedDate')}
          />
        ),
        cell: ({ row }) =>
          new Date(row.original.plannedDate).toLocaleDateString(),
      },
      {
        id: 'assignee',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.inspections.assignee')}
          />
        ),
        cell: ({ row }) => {
          const id = row.original.assigneeId;
          if (!id) return t('service.unassigned');
          return assigneeNames.get(id) ?? id;
        },
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.inspections.status')}
          />
        ),
        cell: ({ row }) =>
          row.original.status === 'completed' ? (
            <Badge variant='secondary'>
              {t('service.inspections.completed')}
            </Badge>
          ) : (
            <Badge variant='outline'>{t('service.inspections.pending')}</Badge>
          ),
      },
      {
        accessorKey: 'result',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.inspections.result')}
          />
        ),
        cell: ({ row }) => row.original.result ?? '—',
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>{t('service.actions')}</span>,
        enableHiding: false,
        cell: ({ row }) =>
          row.original.status === 'pending' ? (
            <Button
              variant='outline'
              size='sm'
              onClick={() => setCompleting(row.original)}
            >
              {t('service.inspections.complete')}
            </Button>
          ) : null,
      },
    ],
    [t, deviceNames, assigneeNames],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('navigation.inspections')}
        description={t('service.inspections.description')}
        actions={
          <div className='flex flex-wrap items-center gap-2'>
            {isAdmin ? (
              <>
                <Button
                  type='button'
                  variant='outline'
                  disabled={maintaining}
                  onClick={() => {
                    void handleMaintenance(
                      'inspections/generate',
                      'service.maintenance.inspectionsGenerated',
                    );
                  }}
                >
                  <RefreshCwIcon data-icon='inline-start' />
                  {t('service.maintenance.generateInspections')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  disabled={maintaining}
                  onClick={() => {
                    void handleMaintenance(
                      'reminders/run',
                      'service.maintenance.remindersSent',
                    );
                  }}
                >
                  {t('service.maintenance.runReminders')}
                </Button>
              </>
            ) : null}
            <Button type='button' onClick={() => setCreating(true)}>
              <PlusIcon data-icon='inline-start' />
              {t('service.inspections.create')}
            </Button>
          </div>
        }
      />

      {inspections.loading ? (
        <LoadingState />
      ) : inspections.error ? (
        <ErrorState message={inspections.error} onRetry={inspections.reload} />
      ) : (
        <DataTable
          columns={columns}
          data={inspections.data ?? []}
          getRowId={(row) => row.id}
          toolbar={(table) => <DataTableViewOptions table={table} />}
          emptyMessage={t('service.empty')}
        />
      )}

      {creating ? (
        <CreateInspectionDialog
          devices={devices.data ?? []}
          assignees={assignees.data ?? []}
          onClose={() => setCreating(false)}
          onSubmit={(payload) => {
            void handleCreate(payload);
          }}
          pending={pending}
        />
      ) : null}

      {completing ? (
        <CompleteInspectionDialog
          onClose={() => setCompleting(null)}
          pending={pending}
          onSubmit={(result) => {
            void handleComplete(result);
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function CreateInspectionDialog({
  devices,
  assignees,
  pending,
  onClose,
  onSubmit,
}: {
  readonly devices: readonly Device[];
  readonly assignees: readonly Assignee[];
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? '');
  const [plannedDate, setPlannedDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [assigneeId, setAssigneeId] = useState('');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('service.inspections.create')}</DialogTitle>
          <DialogDescription>
            {t('service.inspections.formDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='py-2'>
          <Field>
            <FieldLabel htmlFor='inspection-device'>
              {t('service.inspections.device')}
            </FieldLabel>
            <NativeSelect
              id='inspection-device'
              className='w-full'
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
            >
              {devices.map((device) => (
                <NativeSelectOption key={device.id} value={device.id}>
                  {device.code} · {device.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor='inspection-date'>
              {t('service.inspections.plannedDate')}
            </FieldLabel>
            <Input
              id='inspection-date'
              type='date'
              value={plannedDate}
              onChange={(event) => setPlannedDate(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='inspection-assignee'>
              {t('service.inspections.assignee')}
            </FieldLabel>
            <NativeSelect
              id='inspection-assignee'
              className='w-full'
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              <NativeSelectOption value=''>
                {t('service.unassigned')}
              </NativeSelectOption>
              {assignees.map((assignee) => (
                <NativeSelectOption key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onClose}>
            {t('service.cancel')}
          </Button>
          <Button
            type='button'
            disabled={pending || !deviceId || !plannedDate}
            onClick={() =>
              onSubmit({
                deviceId,
                plannedDate,
                assigneeId: assigneeId || null,
              })
            }
          >
            {pending ? t('service.saving') : t('service.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteInspectionDialog({
  pending,
  onClose,
  onSubmit,
}: {
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (result: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [result, setResult] = useState('');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('service.inspections.complete')}</DialogTitle>
          <DialogDescription>
            {t('service.inspections.completeDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='py-2'>
          <Field>
            <FieldLabel htmlFor='inspection-result'>
              {t('service.inspections.result')}
            </FieldLabel>
            <Textarea
              id='inspection-result'
              required
              value={result}
              onChange={(event) => setResult(event.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onClose}>
            {t('service.cancel')}
          </Button>
          <Button
            type='button'
            disabled={pending || !result.trim()}
            onClick={() => onSubmit(result)}
          >
            {pending ? t('service.saving') : t('service.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
