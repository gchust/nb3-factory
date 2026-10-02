import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

import {
  EmptyState,
  EquipmentStatusBadge,
  ErrorState,
  LoadingState,
} from './components.js';
import {
  createEquipment,
  errorMessage,
  formatDate,
  getDirectory,
  listCustomers,
  listEquipment,
  updateEquipment,
  EQUIPMENT_STATUS,
  type Customer,
  type DirectoryProfile,
  type Equipment,
} from './data.js';

interface FormState {
  code: string;
  name: string;
  model: string;
  serialNumber: string;
  location: string;
  status: string;
  customerId: string;
  engineerId: string;
  enabled: boolean;
  nextInspectionDate: string;
  warrantyUntil: string;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  model: '',
  serialNumber: '',
  location: '',
  status: 'active',
  customerId: '',
  engineerId: '',
  enabled: true,
  nextInspectionDate: '',
  warrantyUntil: '',
};

export default function EquipmentPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [rows, setRows] = useState<Equipment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [engineers, setEngineers] = useState<DirectoryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Equipment | 'new'>();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listEquipment(api),
      listCustomers(api),
      getDirectory(api).catch(() => ({ groups: [], profiles: [] })),
    ])
      .then(([equipmentPage, customerPage, directory]) => {
        if (controller.signal.aborted) return;
        setRows(equipmentPage.items);
        setCustomers(customerPage.items);
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

  const customerById = new Map(
    customers.map((customer) => [customer.id, customer.name]),
  );
  const nameById = new Map(
    engineers.map((engineer) => [engineer.userId, engineer.name]),
  );

  const openCreate = (): void => {
    setForm({
      ...EMPTY_FORM,
      customerId: customers[0] ? String(customers[0].id) : '',
    });
    setEditing('new');
  };

  const openEdit = (item: Equipment): void => {
    setForm({
      code: item.code,
      name: item.name,
      model: item.model ?? '',
      serialNumber: item.serialNumber ?? '',
      location: item.location ?? '',
      status: item.status,
      customerId: String(item.customerId),
      engineerId: item.engineerId ?? '',
      enabled: item.enabled,
      nextInspectionDate: item.nextInspectionDate?.slice(0, 10) ?? '',
      warrantyUntil: item.warrantyUntil?.slice(0, 10) ?? '',
    });
    setEditing(item);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    const payload = {
      code: form.code,
      name: form.name,
      model: form.model || null,
      serialNumber: form.serialNumber || null,
      location: form.location || null,
      status: form.status,
      customerId: Number(form.customerId),
      engineerId: form.engineerId || null,
      enabled: form.enabled,
      nextInspectionDate: form.nextInspectionDate || null,
      warrantyUntil: form.warrantyUntil || null,
    };
    try {
      if (editing === 'new') {
        await createEquipment(api, payload);
      } else if (editing) {
        await updateEquipment(api, editing.id, payload);
      }
      toaster.show({ type: 'success', title: t('service.equipment.saved') });
      setEditing(undefined);
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnDef<Equipment>[] = [
    {
      accessorKey: 'code',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('service.equipment.code')}
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
          title={t('service.equipment.name')}
        />
      ),
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.name}</span>
      ),
    },
    {
      accessorKey: 'customerId',
      header: t('service.equipment.customer'),
      cell: ({ row }) =>
        customerById.get(row.original.customerId) ??
        `#${row.original.customerId}`,
    },
    {
      accessorKey: 'status',
      header: t('service.equipment.status'),
      cell: ({ row }) => <EquipmentStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'engineerId',
      header: t('service.equipment.engineer'),
      cell: ({ row }) =>
        row.original.engineerId
          ? (nameById.get(row.original.engineerId) ?? row.original.engineerId)
          : t('service.workOrders.unassigned'),
    },
    {
      accessorKey: 'nextInspectionDate',
      header: t('service.equipment.nextInspection'),
      cell: ({ row }) => formatDate(row.original.nextInspectionDate),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className='flex justify-end'>
          <Button
            size='icon-sm'
            variant='ghost'
            onClick={() => openEdit(row.original)}
          >
            <PencilIcon />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('service.equipment.title')}
        description={t('service.equipment.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t('service.equipment.create')}
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('service.equipment.empty')} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
        />
      )}

      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {editing === 'new'
                ? t('service.equipment.create')
                : t('service.equipment.edit')}
            </DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='equipment-code'>
                  {t('service.equipment.code')}
                </FieldLabel>
                <Input
                  id='equipment-code'
                  value={form.code}
                  onChange={(event) =>
                    setForm({ ...form, code: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='equipment-name'>
                  {t('service.equipment.name')}
                </FieldLabel>
                <Input
                  id='equipment-name'
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='equipment-model'>
                  {t('service.equipment.model')}
                </FieldLabel>
                <Input
                  id='equipment-model'
                  value={form.model}
                  onChange={(event) =>
                    setForm({ ...form, model: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='equipment-serial'>
                  {t('service.equipment.serialNumber')}
                </FieldLabel>
                <Input
                  id='equipment-serial'
                  value={form.serialNumber}
                  onChange={(event) =>
                    setForm({ ...form, serialNumber: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>{t('service.equipment.customer')}</FieldLabel>
              <Select
                value={form.customerId}
                onValueChange={(customerId) =>
                  setForm({ ...form, customerId: customerId ?? '' })
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('service.workOrders.selectCustomer')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel>{t('service.equipment.status')}</FieldLabel>
                <Select
                  value={form.status}
                  onValueChange={(status) =>
                    setForm({ ...form, status: status ?? '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT_STATUS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`service.equipmentStatus.${status}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('service.equipment.engineer')}</FieldLabel>
                <Select
                  value={form.engineerId}
                  onValueChange={(engineerId) =>
                    setForm({ ...form, engineerId: engineerId ?? '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('service.workOrders.unassigned')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers.map((engineer) => (
                      <SelectItem key={engineer.userId} value={engineer.userId}>
                        {engineer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='equipment-inspection'>
                  {t('service.equipment.nextInspection')}
                </FieldLabel>
                <Input
                  id='equipment-inspection'
                  type='date'
                  value={form.nextInspectionDate}
                  onChange={(event) =>
                    setForm({ ...form, nextInspectionDate: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='equipment-warranty'>
                  {t('service.equipment.warranty')}
                </FieldLabel>
                <Input
                  id='equipment-warranty'
                  type='date'
                  value={form.warrantyUntil}
                  onChange={(event) =>
                    setForm({ ...form, warrantyUntil: event.target.value })
                  }
                />
              </Field>
            </div>
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm({ ...form, enabled: checked === true })
                }
              />
              {t('service.equipment.enabled')}
            </label>
          </FieldGroup>
          <DialogFooter>
            <Button variant='outline' onClick={() => setEditing(undefined)}>
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={busy || !form.code || !form.name || !form.customerId}
              onClick={() => void save()}
            >
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
