import { useToaster, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { useCallback, useMemo, useState, type ReactElement } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  type Customer,
  type Device,
} from './model.js';
import { ErrorState, LoadingState } from './shared.js';

interface DeviceDraft {
  readonly code: string;
  readonly name: string;
  readonly customerId: string;
  readonly serviceEngineerId: string;
  readonly enabled: boolean;
  readonly nextInspectionAt: string;
  readonly notes: string;
}

function toDateInput(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function DeviceDialog({
  device,
  customers,
  engineers,
  onClose,
  onSaved,
}: {
  readonly device: Device | null;
  readonly customers: readonly Customer[];
  readonly engineers: readonly Assignee[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const api = useApiClient();
  const [draft, setDraft] = useState<DeviceDraft>(() => ({
    code: device?.code ?? '',
    name: device?.name ?? '',
    customerId: device?.customerId ?? customers[0]?.id ?? '',
    serviceEngineerId: device?.serviceEngineerId ?? '',
    enabled: device?.enabled ?? true,
    nextInspectionAt: toDateInput(device?.nextInspectionAt ?? null),
    notes: device?.notes ?? '',
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = async (): Promise<void> => {
    if (!draft.code.trim() || !draft.name.trim() || !draft.customerId) {
      setError(t('service.validation.required'));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const body = {
        code: draft.code,
        name: draft.name,
        customerId: draft.customerId,
        serviceEngineerId: draft.serviceEngineerId || null,
        enabled: draft.enabled,
        nextInspectionAt: draft.nextInspectionAt || null,
        notes: draft.notes || null,
      };
      if (device) {
        await serviceRequest(api, `devices/${device.id}`, {
          method: 'PUT',
          json: body,
        });
      } else {
        await serviceRequest(api, 'devices', { method: 'POST', json: body });
      }
      toaster.show({ type: 'success', title: t('service.saved') });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {device ? t('service.devices.edit') : t('service.devices.create')}
          </DialogTitle>
          <DialogDescription>
            {t('service.devices.formDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='py-2'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='device-code'>
                {t('service.devices.code')}
              </FieldLabel>
              <Input
                id='device-code'
                required
                value={draft.code}
                onChange={(event) =>
                  setDraft({ ...draft, code: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='device-name'>
                {t('service.devices.name')}
              </FieldLabel>
              <Input
                id='device-name'
                required
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor='device-customer'>
              {t('service.devices.customer')}
            </FieldLabel>
            <NativeSelect
              id='device-customer'
              className='w-full'
              value={draft.customerId}
              onChange={(event) =>
                setDraft({ ...draft, customerId: event.target.value })
              }
            >
              {customers.map((customer) => (
                <NativeSelectOption key={customer.id} value={customer.id}>
                  {customer.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='device-engineer'>
                {t('service.devices.engineer')}
              </FieldLabel>
              <NativeSelect
                id='device-engineer'
                className='w-full'
                value={draft.serviceEngineerId}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    serviceEngineerId: event.target.value,
                  })
                }
              >
                <NativeSelectOption value=''>
                  {t('service.unassigned')}
                </NativeSelectOption>
                {engineers.map((engineer) => (
                  <NativeSelectOption key={engineer.id} value={engineer.id}>
                    {engineer.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor='device-next'>
                {t('service.devices.nextInspectionAt')}
              </FieldLabel>
              <Input
                id='device-next'
                type='date'
                value={draft.nextInspectionAt}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    nextInspectionAt: event.target.value,
                  })
                }
              />
            </Field>
          </div>
          <Field orientation='horizontal'>
            <FieldLabel htmlFor='device-enabled'>
              {t('service.devices.enabled')}
            </FieldLabel>
            <input
              id='device-enabled'
              type='checkbox'
              checked={draft.enabled}
              onChange={(event) =>
                setDraft({ ...draft, enabled: event.target.checked })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='device-notes'>
              {t('service.devices.notes')}
            </FieldLabel>
            <Textarea
              id='device-notes'
              value={draft.notes}
              onChange={(event) =>
                setDraft({ ...draft, notes: event.target.value })
              }
            />
          </Field>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onClose}>
            {t('service.cancel')}
          </Button>
          <Button
            type='button'
            onClick={() => void submit()}
            disabled={pending}
          >
            {pending ? t('service.saving') : t('service.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const api = useApiClient();
  const devices = useServiceResource<Device[]>('devices');
  const customers = useServiceResource<Customer[]>('customers');
  const assignees = useServiceResource<Assignee[]>('assignees');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Device | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  const customerNames = useMemo(
    () => new Map((customers.data ?? []).map((row) => [row.id, row.name])),
    [customers.data],
  );
  const assigneeNames = useMemo(
    () => new Map((assignees.data ?? []).map((row) => [row.id, row.name])),
    [assignees.data],
  );

  const rows = useMemo(() => {
    const list = devices.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((device) =>
      [
        device.code,
        device.name,
        customerNames.get(device.customerId) ?? device.customerId,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [devices.data, customerNames, search]);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    setPendingDelete(true);
    try {
      await serviceRequest(api, `devices/${deleting.id}`, { method: 'DELETE' });
      toaster.show({ type: 'success', title: t('service.deleted') });
      setDeleting(null);
      devices.reload();
    } catch (cause) {
      toaster.show({
        type: 'error',
        title: t('service.deleteFailed'),
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setPendingDelete(false);
    }
  }, [api, devices, deleting, t, toaster]);

  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.devices.code')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.devices.name')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        id: 'customer',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.devices.customer')}
          />
        ),
        cell: ({ row }) =>
          customerNames.get(row.original.customerId) ?? row.original.customerId,
      },
      {
        id: 'engineer',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.devices.engineer')}
          />
        ),
        cell: ({ row }) => {
          const id = row.original.serviceEngineerId;
          if (!id) return t('service.unassigned');
          return assigneeNames.get(id) ?? id;
        },
      },
      {
        accessorKey: 'enabled',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.devices.enabled')}
          />
        ),
        cell: ({ row }) =>
          row.original.enabled ? (
            <Badge variant='secondary'>{t('service.devices.active')}</Badge>
          ) : (
            <Badge variant='outline'>{t('service.devices.inactive')}</Badge>
          ),
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>{t('service.actions')}</span>,
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('service.actions')}
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => setEditing(row.original)}>
                <PencilIcon />
                {t('service.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                onClick={() => setDeleting(row.original)}
              >
                <Trash2Icon />
                {t('service.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [t, customerNames, assigneeNames],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('navigation.devices')}
        description={t('service.devices.description')}
        actions={
          <Button
            type='button'
            onClick={() => setEditing('new')}
            disabled={!customers.data || customers.data.length === 0}
          >
            <PlusIcon data-icon='inline-start' />
            {t('service.devices.create')}
          </Button>
        }
      />

      <div className='flex items-center gap-2'>
        <Input
          className='max-w-sm'
          placeholder={t('service.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {devices.loading ? (
        <LoadingState />
      ) : devices.error ? (
        <ErrorState message={devices.error} onRetry={devices.reload} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          toolbar={(table) => <DataTableViewOptions table={table} />}
          emptyMessage={t('service.empty')}
        />
      )}

      {editing ? (
        <DeviceDialog
          device={editing === 'new' ? null : editing}
          customers={customers.data ?? []}
          engineers={assignees.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            devices.reload();
          }}
        />
      ) : null}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.devices.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.devices.deleteDescription', {
                name: deleting?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('service.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => void confirmDelete()}
              disabled={pendingDelete}
            >
              {t('service.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
