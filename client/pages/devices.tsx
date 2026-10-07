import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, PlusIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/index.js';
import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { Field, FormDialog } from '@/components/service/form-dialog.js';
import { SelectField } from '@/components/service/select-field.js';
import { EmptyTable, RequestError } from '@/components/service/states.js';
import { formatDate, toDateInput } from '@/components/service/format.js';
import type {
  CustomerView,
  DeviceView,
  Paged,
  ServiceGroupView,
  ShareTargetView,
} from '@/components/service/types.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useApiQuery, useClient, useDebouncedValue } from '@/hooks/use-service-api.js';

interface DeviceFormState {
  readonly name: string;
  readonly code: string;
  readonly model: string;
  readonly serialNumber: string;
  readonly customerId: string;
  readonly serviceEngineerId: string;
  readonly groupId: string;
  readonly location: string;
  readonly installDate: string;
  readonly warrantyUntil: string;
  readonly nextInspectionDate: string;
  readonly inspectionCycleDays: string;
  readonly enabled: boolean;
  readonly note: string;
}

const EMPTY_FORM: DeviceFormState = {
  name: '',
  code: '',
  model: '',
  serialNumber: '',
  customerId: '',
  serviceEngineerId: '',
  groupId: '',
  location: '',
  installDate: '',
  warrantyUntil: '',
  nextInspectionDate: '',
  inspectionCycleDays: '180',
  enabled: true,
  note: '',
};

/** `YYYY-MM-DD` from a date input, as the ISO datetime the API expects. */
function toIsoDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toForm(device: DeviceView): DeviceFormState {
  return {
    name: device.name,
    code: device.code,
    model: device.model ?? '',
    serialNumber: device.serialNumber ?? '',
    customerId: device.customerId,
    serviceEngineerId: device.serviceEngineerId ?? '',
    groupId: device.groupId ?? '',
    location: device.location ?? '',
    installDate: toDateInput(device.installDate),
    warrantyUntil: toDateInput(device.warrantyUntil),
    nextInspectionDate: toDateInput(device.nextInspectionDate),
    inspectionCycleDays: String(device.inspectionCycleDays),
    enabled: device.enabled,
    note: device.note ?? '',
  };
}

export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const client = useClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DeviceView | null>(null);
  const [form, setForm] = useState<DeviceFormState>(EMPTY_FORM);

  const list = useApiQuery<Paged<DeviceView>>('/devices', {
    search: debouncedSearch.trim() || undefined,
    pageSize: 200,
  });
  const customers = useApiQuery<Paged<CustomerView>>('/customers', {
    pageSize: 200,
  });
  const groups = useApiQuery<Paged<ServiceGroupView>>('/serviceGroups', {});
  // Only a caller who may share a work order may list accounts; a device-only
  // reader simply gets no engineer choices.
  const users = useApiQuery<{ data: readonly ShareTargetView[] }>(
    '/workOrders/shareTargets',
    {},
  );

  const customerOptions = useMemo(
    () =>
      (customers.data?.data ?? []).map((customer) => ({
        value: customer.id,
        label: `${customer.code} · ${customer.name}`,
      })),
    [customers.data],
  );
  const engineerOptions = useMemo(
    () =>
      (users.data?.data ?? []).map((user) => ({
        value: user.id,
        label: user.name,
      })),
    [users.data],
  );
  const groupOptions = useMemo(
    () =>
      (groups.data?.data ?? []).map((group) => ({
        value: group.id,
        label: group.name,
      })),
    [groups.data],
  );

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setCreating(true);
  };
  const openEdit = (device: DeviceView) => {
    setForm(toForm(device));
    setEditing(device);
  };
  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  const submit = async () => {
    const creatingNow = creating;
    const payload = {
      ...(creatingNow ? { code: form.code.trim() } : {}),
      name: form.name.trim(),
      model: form.model.trim() || null,
      serialNumber: form.serialNumber.trim() || null,
      customerId: form.customerId,
      serviceEngineerId: form.serviceEngineerId || null,
      groupId: form.groupId || null,
      location: form.location.trim() || null,
      installDate: toIsoDate(form.installDate),
      warrantyUntil: toIsoDate(form.warrantyUntil),
      nextInspectionDate: toIsoDate(form.nextInspectionDate),
      inspectionCycleDays: Number(form.inspectionCycleDays) || 180,
      enabled: form.enabled,
      note: form.note.trim() || null,
    };
    if (creatingNow) {
      await client.request({ path: '/devices', method: 'POST', json: payload });
    } else if (editing) {
      await client.request({
        path: `/devices/${editing.id}`,
        method: 'PATCH',
        json: payload,
      });
    }
    list.reload();
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: 'code',
        header: t('service.device.code'),
        cell: ({ row }: { row: { original: DeviceView } }) => (
          <span className='font-mono text-xs'>{row.original.code}</span>
        ),
      },
      { accessorKey: 'name', header: t('service.device.name') },
      {
        accessorKey: 'customerName',
        header: t('service.device.customer'),
        cell: ({ row }: { row: { original: DeviceView } }) => (
          <span>{row.original.customerName ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'model',
        header: t('service.device.model'),
        cell: ({ row }: { row: { original: DeviceView } }) => (
          <span>{row.original.model ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'serviceEngineerName',
        header: t('service.device.engineer'),
        cell: ({ row }: { row: { original: DeviceView } }) => (
          <span>{row.original.serviceEngineerName ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'nextInspectionDate',
        header: t('service.device.nextInspection'),
        cell: ({ row }: { row: { original: DeviceView } }) => (
          <span>{formatDate(row.original.nextInspectionDate)}</span>
        ),
      },
      {
        accessorKey: 'enabled',
        header: t('service.device.enabled'),
        cell: ({ row }: { row: { original: DeviceView } }) => (
          <span>
            {row.original.enabled
              ? t('service.device.enabledOn')
              : t('service.device.enabledOff')}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: { original: DeviceView } }) => (
          <Button variant='ghost' size='sm' onClick={() => openEdit(row.original)}>
            <PencilIcon />
            {t('service.action.edit')}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.device.title')}
        description={t('service.device.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t('service.device.create')}
          </Button>
        }
      />

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('service.device.searchPlaceholder')}
        className='max-w-xs'
      />

      {list.error ? (
        <RequestError error={list.error} onRetry={list.reload} />
      ) : null}

      {list.data ? (
        list.data.data.length === 0 ? (
          <EmptyTable title={t('service.device.empty')} />
        ) : (
          <DataTable
            columns={columns}
            data={[...list.data.data]}
            getRowId={(row) => row.id}
            showSelectedCount={false}
            emptyMessage={t('service.device.empty')}
          />
        )
      ) : null}

      <FormDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={creating ? t('service.device.create') : t('service.device.edit')}
        onSubmit={submit}
        wide
        canSubmit={
          form.name.trim().length > 0 &&
          form.customerId.length > 0 &&
          (!creating || form.code.trim().length > 0)
        }
      >
        {creating ? (
          <Field label={t('service.device.code')} htmlFor='device-code'>
            <Input
              id='device-code'
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
            />
          </Field>
        ) : null}
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label={t('service.device.name')} htmlFor='device-name'>
            <Input
              id='device-name'
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label={t('service.device.customer')} htmlFor='device-customer'>
            <SelectField
              id='device-customer'
              value={form.customerId || null}
              onValueChange={(customerId) => setForm({ ...form, customerId })}
              options={customerOptions}
              placeholder={t('service.device.customerPlaceholder')}
              className='w-full'
            />
          </Field>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label={t('service.device.model')} htmlFor='device-model'>
            <Input
              id='device-model'
              value={form.model}
              onChange={(event) => setForm({ ...form, model: event.target.value })}
            />
          </Field>
          <Field
            label={t('service.device.serialNumber')}
            htmlFor='device-serial'
          >
            <Input
              id='device-serial'
              value={form.serialNumber}
              onChange={(event) =>
                setForm({ ...form, serialNumber: event.target.value })
              }
            />
          </Field>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label={t('service.device.engineer')} htmlFor='device-engineer'>
            <SelectField
              id='device-engineer'
              value={form.serviceEngineerId || null}
              onValueChange={(serviceEngineerId) =>
                setForm({ ...form, serviceEngineerId })
              }
              options={engineerOptions}
              placeholder={t('service.device.engineerPlaceholder')}
              className='w-full'
            />
          </Field>
          <Field label={t('service.device.group')} htmlFor='device-group'>
            <SelectField
              id='device-group'
              value={form.groupId || null}
              onValueChange={(groupId) => setForm({ ...form, groupId })}
              options={groupOptions}
              placeholder={t('service.device.groupPlaceholder')}
              className='w-full'
            />
          </Field>
        </div>
        <div className='grid gap-4 sm:grid-cols-3'>
          <Field label={t('service.device.installDate')} htmlFor='device-install'>
            <Input
              id='device-install'
              type='date'
              value={form.installDate}
              onChange={(event) =>
                setForm({ ...form, installDate: event.target.value })
              }
            />
          </Field>
          <Field
            label={t('service.device.warrantyUntil')}
            htmlFor='device-warranty'
          >
            <Input
              id='device-warranty'
              type='date'
              value={form.warrantyUntil}
              onChange={(event) =>
                setForm({ ...form, warrantyUntil: event.target.value })
              }
            />
          </Field>
          <Field
            label={t('service.device.nextInspection')}
            htmlFor='device-next'
          >
            <Input
              id='device-next'
              type='date'
              value={form.nextInspectionDate}
              onChange={(event) =>
                setForm({ ...form, nextInspectionDate: event.target.value })
              }
            />
          </Field>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field
            label={t('service.device.cycleDays')}
            htmlFor='device-cycle'
            hint={t('service.device.cycleDaysHint')}
          >
            <Input
              id='device-cycle'
              type='number'
              min={1}
              max={3650}
              value={form.inspectionCycleDays}
              onChange={(event) =>
                setForm({ ...form, inspectionCycleDays: event.target.value })
              }
            />
          </Field>
          <div className='flex items-center gap-3 pt-6'>
            <Switch
              id='device-enabled'
              checked={form.enabled}
              onCheckedChange={(enabled) => setForm({ ...form, enabled })}
            />
            <label htmlFor='device-enabled' className='text-sm'>
              {t('service.device.enabledLabel')}
            </label>
          </div>
        </div>
        <Field label={t('service.device.location')} htmlFor='device-location'>
          <Input
            id='device-location'
            value={form.location}
            onChange={(event) =>
              setForm({ ...form, location: event.target.value })
            }
          />
        </Field>
        <Field label={t('service.device.note')} htmlFor='device-note'>
          <Textarea
            id='device-note'
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
        </Field>
      </FormDialog>
    </PageContainer>
  );
}
