import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  useServiceApi,
  type CustomerView,
  type DeviceView,
  type ServiceApi,
} from '@/lib/service-api';
import { useAsync } from '@/lib/use-async';

import { ErrorBlock, LoadingBlock } from '../shared.js';
import { formatDate } from '../format.js';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export default function LedgerPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [tab, setTab] = useState('customers');

  return (
    <PageContainer>
      <PageHeader
        title={t('service.ledger.title')}
        description={t('service.ledger.description')}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant='line'>
          <TabsTrigger value='customers'>
            {t('service.ledger.customers')}
          </TabsTrigger>
          <TabsTrigger value='devices'>
            {t('service.ledger.devices')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'customers' ? (
        <CustomersTab api={api} t={t} />
      ) : (
        <DevicesTab api={api} t={t} />
      )}
    </PageContainer>
  );
}

function CustomersTab({
  api,
  t,
}: {
  api: ServiceApi;
  t: Translate;
}): ReactElement {
  const toaster = useToaster();
  const [editing, setEditing] = useState<CustomerView | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const customers = useAsync(() => api.customers(), [api]);

  const columns = useMemo<ColumnDef<CustomerView>[]>(
    () => [
      { accessorKey: 'name', header: t('service.ledger.name') },
      {
        accessorKey: 'contactName',
        header: t('service.ledger.contactName'),
        cell: ({ row }) => row.original.contactName ?? '—',
      },
      {
        accessorKey: 'contactPhone',
        header: t('service.ledger.contactPhone'),
        cell: ({ row }) => row.original.contactPhone ?? '—',
      },
      {
        accessorKey: 'address',
        header: t('service.ledger.address'),
        cell: ({ row }) => row.original.address ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            size='xs'
            variant='ghost'
            onClick={(event) => {
              event.stopPropagation();
              setEditing(row.original);
              setForm({
                name: row.original.name,
                contactName: row.original.contactName ?? '',
                contactPhone: row.original.contactPhone ?? '',
                address: row.original.address ?? '',
                note: row.original.note ?? '',
              });
              setOpen(true);
            }}
          >
            {t('service.common.edit')}
          </Button>
        ),
      },
    ],
    [t],
  );

  function startCreate(): void {
    setEditing(null);
    setForm({});
    setOpen(true);
  }

  async function save(): Promise<void> {
    if (!form.name?.trim()) {
      toaster.show({ type: 'error', title: t('service.ledger.nameRequired') });
      return;
    }
    try {
      if (editing) {
        await api.updateCustomer(editing.id, form);
      } else {
        await api.createCustomer(form);
      }
      toaster.show({ type: 'success', title: t('service.common.saved') });
      setOpen(false);
      customers.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.common.saveFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <>
      <div className='mb-3 flex justify-end'>
        <Button size='sm' onClick={startCreate}>
          {t('service.ledger.newCustomer')}
        </Button>
      </div>
      {customers.error ? (
        <ErrorBlock error={customers.error} onRetry={customers.reload} />
      ) : !customers.data ? (
        <LoadingBlock />
      ) : (
        <DataTable
          columns={columns}
          data={customers.data}
          getRowId={(row) => String(row.id)}
        />
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('service.ledger.editCustomer')
                : t('service.ledger.newCustomer')}
            </DialogTitle>
          </DialogHeader>
          <FieldGroup className='py-2'>
            {(
              [
                ['name', t('service.ledger.name'), true],
                ['contactName', t('service.ledger.contactName'), false],
                ['contactPhone', t('service.ledger.contactPhone'), false],
                ['address', t('service.ledger.address'), false],
              ] as const
            ).map(([key, label, required]) => (
              <Field key={key}>
                <FieldLabel htmlFor={`customer-${key}`}>{label}</FieldLabel>
                <Input
                  id={`customer-${key}`}
                  value={form[key] ?? ''}
                  required={required}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, [key]: event.target.value }))
                  }
                />
              </Field>
            ))}
            <Field>
              <FieldLabel htmlFor='customer-note'>
                {t('service.ledger.note')}
              </FieldLabel>
              <Textarea
                id='customer-note'
                rows={3}
                value={form.note ?? ''}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setOpen(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button type='button' onClick={() => void save()}>
              {t('service.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DevicesTab({
  api,
  t,
}: {
  api: ServiceApi;
  t: Translate;
}): ReactElement {
  const toaster = useToaster();
  const [editing, setEditing] = useState<DeviceView | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const devices = useAsync(() => api.devices(), [api]);
  const customers = useAsync(() => api.customers(), [api]);
  const me = useAsync(() => api.me(), [api]);
  const canManage = me.data?.can.manageLedger ?? false;
  // The directory needs `supervise`, which the read-only roles lack, so it is
  // only requested once the caller is known to manage the ledger.
  const engineers = useAsync(
    () => (canManage ? api.engineers() : Promise.resolve([])),
    [api, canManage],
  );

  const customerItems = useMemo(
    () =>
      (customers.data ?? []).map((customer) => ({
        value: String(customer.id),
        label: customer.name,
      })),
    [customers.data],
  );
  const engineerItems = useMemo(
    () =>
      (engineers.data ?? []).map((engineer) => ({
        value: String(engineer.id),
        label: engineer.displayName ?? engineer.username,
      })),
    [engineers.data],
  );

  const columns = useMemo<ColumnDef<DeviceView>[]>(
    () => [
      {
        accessorKey: 'deviceNo',
        header: t('service.ledger.deviceNo'),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.deviceNo}</span>
        ),
      },
      { accessorKey: 'name', header: t('service.ledger.deviceName') },
      {
        id: 'customer',
        header: t('service.ledger.customer'),
        cell: ({ row }) =>
          customers.data?.find((item) => item.id === row.original.customerId)
            ?.name ?? '—',
      },
      {
        accessorKey: 'status',
        header: t('service.ledger.status'),
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === 'disabled' ? 'destructive' : 'secondary'
            }
          >
            {t(`service.ledger.deviceStatus.${row.original.status}`, {
              defaultValue: row.original.status,
            })}
          </Badge>
        ),
      },
      {
        accessorKey: 'nextInspectionDate',
        header: t('service.ledger.nextInspection'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatDate(row.original.nextInspectionDate)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            size='xs'
            variant='ghost'
            onClick={(event) => {
              event.stopPropagation();
              setEditing(row.original);
              setForm({
                deviceNo: row.original.deviceNo,
                name: row.original.name,
                model: row.original.model ?? '',
                location: row.original.location ?? '',
                status: row.original.status,
                customerId: String(row.original.customerId),
                engineerProfileId: row.original.engineerProfileId
                  ? String(row.original.engineerProfileId)
                  : '',
                nextInspectionDate: row.original.nextInspectionDate
                  ? row.original.nextInspectionDate.slice(0, 10)
                  : '',
              });
              setOpen(true);
            }}
          >
            {t('service.common.edit')}
          </Button>
        ),
      },
    ],
    [t, customers.data],
  );

  function startCreate(): void {
    setEditing(null);
    setForm({ status: 'active' });
    setOpen(true);
  }

  async function save(): Promise<void> {
    if (!form.deviceNo?.trim() || !form.name?.trim() || !form.customerId) {
      toaster.show({
        type: 'error',
        title: t('service.ledger.deviceRequired'),
      });
      return;
    }
    const engineer = (engineers.data ?? []).find(
      (item) => String(item.id) === form.engineerProfileId,
    );
    const payload = {
      ...form,
      customerId: Number(form.customerId),
      engineerProfileId: form.engineerProfileId
        ? Number(form.engineerProfileId)
        : null,
      serviceEngineerId: engineer?.userId ?? null,
      nextInspectionDate: form.nextInspectionDate || null,
    };
    try {
      if (editing) {
        await api.updateDevice(editing.id, payload);
      } else {
        await api.createDevice(payload);
      }
      toaster.show({ type: 'success', title: t('service.common.saved') });
      setOpen(false);
      devices.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.common.saveFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <>
      <div className='mb-3 flex justify-end'>
        <Button size='sm' onClick={startCreate}>
          {t('service.ledger.newDevice')}
        </Button>
      </div>
      {devices.error ? (
        <ErrorBlock error={devices.error} onRetry={devices.reload} />
      ) : !devices.data ? (
        <LoadingBlock />
      ) : (
        <DataTable
          columns={columns}
          data={devices.data}
          getRowId={(row) => String(row.id)}
        />
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('service.ledger.editDevice')
                : t('service.ledger.newDevice')}
            </DialogTitle>
          </DialogHeader>
          <FieldGroup className='max-h-[60vh] overflow-y-auto py-2'>
            <Field>
              <FieldLabel htmlFor='device-no'>
                {t('service.ledger.deviceNo')}
              </FieldLabel>
              <Input
                id='device-no'
                value={form.deviceNo ?? ''}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, deviceNo: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='device-name'>
                {t('service.ledger.deviceName')}
              </FieldLabel>
              <Input
                id='device-name'
                value={form.name ?? ''}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='device-customer'>
                {t('service.ledger.customer')}
              </FieldLabel>
              <Select
                items={customerItems}
                value={form.customerId ?? ''}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, customerId: String(value) }))
                }
              >
                <SelectTrigger id='device-customer' className='w-full'>
                  <SelectValue placeholder={t('service.common.select')} />
                </SelectTrigger>
                <SelectContent>
                  {(customers.data ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {canManage ? (
              <Field>
                <FieldLabel htmlFor='device-engineer'>
                  {t('service.ledger.serviceEngineer')}
                </FieldLabel>
                <Select
                  items={engineerItems}
                  value={form.engineerProfileId ?? ''}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      engineerProfileId: String(value),
                    }))
                  }
                >
                  <SelectTrigger id='device-engineer' className='w-full'>
                    <SelectValue
                      placeholder={t('service.ledger.unassigned')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(engineers.data ?? []).map((engineer) => (
                      <SelectItem key={engineer.id} value={String(engineer.id)}>
                        {engineer.displayName ?? engineer.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='device-model'>
                  {t('service.ledger.model')}
                </FieldLabel>
                <Input
                  id='device-model'
                  value={form.model ?? ''}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, model: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='device-location'>
                  {t('service.ledger.location')}
                </FieldLabel>
                <Input
                  id='device-location'
                  value={form.location ?? ''}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      location: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='device-status'>
                  {t('service.ledger.status')}
                </FieldLabel>
                <Select
                  items={[
                    {
                      value: 'active',
                      label: t('service.ledger.deviceStatus.active'),
                    },
                    {
                      value: 'maintenance',
                      label: t('service.ledger.deviceStatus.maintenance'),
                    },
                    {
                      value: 'disabled',
                      label: t('service.ledger.deviceStatus.disabled'),
                    },
                  ]}
                  value={form.status ?? 'active'}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, status: String(value) }))
                  }
                >
                  <SelectTrigger id='device-status' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='active'>
                      {t('service.ledger.deviceStatus.active')}
                    </SelectItem>
                    <SelectItem value='maintenance'>
                      {t('service.ledger.deviceStatus.maintenance')}
                    </SelectItem>
                    <SelectItem value='disabled'>
                      {t('service.ledger.deviceStatus.disabled')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor='device-inspection'>
                  {t('service.ledger.nextInspection')}
                </FieldLabel>
                <Input
                  id='device-inspection'
                  type='date'
                  value={form.nextInspectionDate ?? ''}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      nextInspectionDate: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setOpen(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button type='button' onClick={() => void save()}>
              {t('service.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
