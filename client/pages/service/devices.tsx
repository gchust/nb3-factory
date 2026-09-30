import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { CpuIcon, PencilIcon, PlusIcon } from 'lucide-react';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

import { DeviceStatusBadge } from './components/service-badges.js';
import { ServiceTableToolbar } from './components/service-table-toolbar.js';
import {
  DateText,
  EmptyState,
  LoadError,
  TableSkeleton,
} from './components/service-states.js';
import { errorMessage } from './service-api.js';
import {
  useAsync,
  useServiceApi,
  useServicePermission,
} from './service-hooks.js';
import { DEVICE_STATUSES, type ServiceDevice } from './types.js';

interface FormState {
  readonly serialNumber: string;
  readonly name: string;
  readonly model: string;
  readonly category: string;
  readonly location: string;
  readonly status: string;
  readonly warrantyUntil: string;
  readonly notes: string;
  readonly customerId: string;
}

const EMPTY_FORM: FormState = {
  serialNumber: '',
  name: '',
  model: '',
  category: '',
  location: '',
  status: 'active',
  warrantyUntil: '',
  notes: '',
  customerId: '',
};

/** The installed-device ledger, grouped under the customer that owns them. */
export default function ServiceDevicesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const [customerFilter, setCustomerFilter] = useState('');
  const [editing, setEditing] = useState<ServiceDevice | null>(null);
  const [creating, setCreating] = useState(false);
  const open = creating || editing !== null;

  const customers = useAsync(
    () => api.listCustomers({ limit: 500 }),
    'devices-customers',
  );
  const devices = useAsync(
    () =>
      api.listDevices(
        customerFilter ? { customerId: Number(customerFilter) } : {},
      ),
    `devices:${customerFilter}`,
  );
  const canManage = useServicePermission('service.devices', 'manage');

  const customerName = useCallback(
    (id: number) =>
      (customers.data ?? []).find((customer) => customer.id === id)?.name ??
      `#${id}`,
    [customers.data],
  );

  const columns = useMemo<ColumnDef<ServiceDevice>[]>(
    () => [
      {
        accessorKey: 'serialNumber',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.device.serialNumber')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-mono text-sm'>{row.original.serialNumber}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.device.name')}
          />
        ),
        filterFn: (row, _columnId, value) => {
          const needle = String(value).toLowerCase();
          return [
            row.original.name,
            row.original.serialNumber,
            row.original.model,
            row.original.location,
          ]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(needle));
        },
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col'>
            <span className='truncate font-medium'>{row.original.name}</span>
            <span className='truncate text-xs text-muted-foreground'>
              {[row.original.model, row.original.category]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'customerId',
        header: t('service.ticket.customer'),
        cell: ({ row }) => (
          <span className='text-sm'>
            {customerName(row.original.customerId)}
          </span>
        ),
      },
      {
        accessorKey: 'location',
        header: t('service.device.location'),
        cell: ({ row }) => (
          <span className='text-sm text-muted-foreground'>
            {row.original.location ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('service.device.status'),
        cell: ({ row }) => <DeviceStatusBadge value={row.original.status} />,
      },
      {
        accessorKey: 'warrantyUntil',
        header: t('service.device.warrantyUntil'),
        cell: ({ row }) => <DateText value={row.original.warrantyUntil} />,
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }) => (
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => setEditing(row.original)}
                >
                  <PencilIcon />
                  {t('service.action.edit')}
                </Button>
              ),
            } satisfies ColumnDef<ServiceDevice>,
          ]
        : []),
    ],
    [canManage, customerName, t],
  );

  const closeForm = useCallback(() => {
    setCreating(false);
    setEditing(null);
  }, []);

  const saved = useCallback(() => {
    closeForm();
    devices.reload();
  }, [closeForm, devices]);

  return (
    <PageContainer>
      <PageHeader
        title={t('service.devices.title')}
        description={t('service.devices.description')}
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              {t('service.devices.new')}
            </Button>
          ) : null
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <NativeSelect
          className='w-64'
          value={customerFilter}
          onChange={(event) => setCustomerFilter(event.target.value)}
        >
          <option value=''>{t('service.devices.allCustomers')}</option>
          {(customers.data ?? []).map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {devices.error ? (
        <LoadError error={devices.error} onRetry={devices.reload} />
      ) : null}

      {devices.loading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : (
        <DataTable
          columns={columns}
          data={devices.data ?? []}
          emptyMessage={<EmptyState title={t('service.devices.empty')} />}
          toolbar={(table) => (
            <ServiceTableToolbar
              table={table}
              columnId='name'
              placeholder={t('service.devices.searchPlaceholder')}
            />
          )}
        />
      )}

      {devices.data && devices.data.length > 0 ? (
        <p className='flex items-center gap-2 text-xs text-muted-foreground'>
          <CpuIcon className='size-3.5' />
          {t('service.devices.count', { count: devices.data.length })}
        </p>
      ) : null}

      <DeviceFormDialog
        key={open ? (editing ? `edit:${editing.id}` : 'create') : 'closed'}
        open={open}
        device={editing}
        customers={customers.data ?? []}
        onClose={closeForm}
        onSaved={saved}
        onError={(error) =>
          toaster.show({
            type: 'error',
            title: t('service.devices.saveFailed'),
            description: errorMessage(error),
          })
        }
      />
    </PageContainer>
  );
}

function DeviceFormDialog({
  open,
  device,
  customers,
  onClose,
  onSaved,
  onError,
}: {
  readonly open: boolean;
  readonly device: ServiceDevice | null;
  readonly customers: readonly { readonly id: number; readonly name: string }[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly onError: (error: unknown) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [form, setForm] = useState<FormState>(() =>
    device
      ? {
          serialNumber: device.serialNumber,
          name: device.name,
          model: device.model ?? '',
          category: device.category ?? '',
          location: device.location ?? '',
          status: device.status,
          warrantyUntil: device.warrantyUntil
            ? device.warrantyUntil.slice(0, 10)
            : '',
          notes: device.notes ?? '',
          customerId: String(device.customerId),
        }
      : EMPTY_FORM,
  );
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (!form.name.trim() || !form.serialNumber.trim() || !form.customerId)
      return;
    setBusy(true);
    const values: Record<string, unknown> = {
      name: form.name.trim(),
      serialNumber: form.serialNumber.trim(),
      status: form.status,
      customerId: Number(form.customerId),
    };
    for (const field of ['model', 'category', 'location', 'notes'] as const) {
      values[field] = form[field].trim() ? form[field].trim() : null;
    }
    values.warrantyUntil = form.warrantyUntil
      ? new Date(`${form.warrantyUntil}T00:00:00.000Z`).toISOString()
      : null;
    try {
      if (device) {
        await api.updateDevice(device.id, values);
      } else {
        await api.createDevice(values);
      }
      onSaved();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }, [api, device, form, onError, onSaved]);

  const text = (
    name: keyof FormState,
    label: ReactNode,
    options: { readonly required?: boolean } = {},
  ): ReactElement => (
    <div className='flex flex-col gap-2'>
      <Label htmlFor={`device-${name}`}>{label}</Label>
      <Input
        id={`device-${name}`}
        value={form[name]}
        required={options.required}
        onChange={(event) =>
          setForm((current) => ({ ...current, [name]: event.target.value }))
        }
      />
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {device ? t('service.devices.edit') : t('service.devices.new')}
          </DialogTitle>
          <DialogDescription>
            {t('service.devices.formDescription')}
          </DialogDescription>
        </DialogHeader>

        <form
          className='flex flex-col gap-4'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className='flex flex-col gap-2'>
            <Label htmlFor='device-customer'>
              {t('service.ticket.customer')}
            </Label>
            <NativeSelect
              id='device-customer'
              className='w-full'
              value={form.customerId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  customerId: event.target.value,
                }))
              }
            >
              <option value=''>{t('service.tickets.selectCustomer')}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {text('name', t('service.device.name'), { required: true })}
          {text('serialNumber', t('service.device.serialNumber'), {
            required: true,
          })}
          {text('model', t('service.device.model'))}
          {text('category', t('service.device.category'))}
          {text('location', t('service.device.location'))}
          <div className='flex flex-col gap-2'>
            <Label htmlFor='device-status'>{t('service.device.status')}</Label>
            <NativeSelect
              id='device-status'
              className='w-full'
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              {DEVICE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`service.deviceStatus.${status}`, {
                    defaultValue: status,
                  })}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='device-warranty'>
              {t('service.device.warrantyUntil')}
            </Label>
            <Input
              id='device-warranty'
              type='date'
              value={form.warrantyUntil}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  warrantyUntil: event.target.value,
                }))
              }
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='device-notes'>{t('service.device.notes')}</Label>
            <Textarea
              id='device-notes'
              rows={3}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={onClose}
            >
              {t('service.action.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={
                busy ||
                !form.name.trim() ||
                !form.serialNumber.trim() ||
                !form.customerId
              }
            >
              {t('service.action.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
