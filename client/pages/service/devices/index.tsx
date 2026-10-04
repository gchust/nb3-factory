import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToaster } from '@nocobase/app-client';

import {
  useServiceRequest,
  type CustomerRecord,
  type DeviceRecord,
  type Paged,
} from '../api.js';
import {
  AsyncBlock,
  formatDate,
  StatusBadge,
  useAsyncData,
} from '../shared.js';

interface DeviceForm {
  deviceNo: string;
  model: string;
  serialNo: string;
  status: string;
  location: string;
  customerId: string;
  installedAt: string;
  warrantyUntil: string;
  nextInspectionAt: string;
  notes: string;
}

const DEVICE_STATUSES = ['active', 'maintenance', 'disabled'] as const;

const EMPTY: DeviceForm = {
  deviceNo: '',
  model: '',
  serialNo: '',
  status: 'active',
  location: '',
  customerId: '',
  installedAt: '',
  warrantyUntil: '',
  nextInspectionAt: '',
  notes: '',
};

function toDateInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const request = useServiceRequest();
  const toaster = useToaster();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<DeviceRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<DeviceForm>(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const state = useAsyncData<Paged<DeviceRecord>>(
    () =>
      request<Paged<DeviceRecord>>('/service/devices', {
        query: { search, pageSize: 100 },
      }),
    [request, search],
  );
  const customers = useAsyncData<Paged<CustomerRecord>>(
    () =>
      request<Paged<CustomerRecord>>('/service/customers', {
        query: { pageSize: 200 },
      }),
    [request],
  );

  function openCreate(): void {
    setForm(EMPTY);
    setFields({});
    setCreating(true);
  }

  function openEdit(device: DeviceRecord): void {
    setForm({
      deviceNo: device.deviceNo,
      model: device.model,
      serialNo: device.serialNo ?? '',
      status: device.status,
      location: device.location ?? '',
      customerId: device.customerId ? String(device.customerId) : '',
      installedAt: toDateInput(device.installedAt),
      warrantyUntil: toDateInput(device.warrantyUntil),
      nextInspectionAt: toDateInput(device.nextInspectionAt),
      notes: device.notes ?? '',
    });
    setFields({});
    setEditing(device);
  }

  function close(): void {
    setCreating(false);
    setEditing(null);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.deviceNo.trim()) next.deviceNo = t('service.validation.required');
    if (!form.model.trim()) next.model = t('service.validation.required');
    if (!form.customerId) next.customerId = t('service.validation.required');
    setFields(next);
    if (Object.keys(next).length) return;
    setPending(true);
    const body = {
      deviceNo: form.deviceNo.trim(),
      model: form.model.trim(),
      serialNo: form.serialNo || null,
      status: form.status,
      location: form.location || null,
      customerId: form.customerId ? Number(form.customerId) : null,
      installedAt: form.installedAt || null,
      warrantyUntil: form.warrantyUntil || null,
      nextInspectionAt: form.nextInspectionAt || null,
      notes: form.notes || null,
    };
    try {
      if (editing) {
        await request(`/service/devices/${editing.id}`, {
          method: 'PATCH',
          json: body,
        });
        toaster.show({ type: 'success', title: t('service.devices.updated') });
      } else {
        await request('/service/devices', { method: 'POST', json: body });
        toaster.show({ type: 'success', title: t('service.devices.created') });
      }
      close();
      state.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.error.title'),
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('service.devices.title')}
        description={t('service.devices.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon='inline-start' />
            {t('service.devices.create')}
          </Button>
        }
      />

      <div className='relative w-full max-w-sm'>
        <SearchIcon className='pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground' />
        <Input
          className='pl-8'
          placeholder={t('service.devices.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <AsyncBlock state={state} empty={(data) => data.items.length === 0}>
        {(data) => (
          <div className='rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.devices.deviceNo')}</TableHead>
                  <TableHead>{t('service.devices.model')}</TableHead>
                  <TableHead>{t('service.devices.customer')}</TableHead>
                  <TableHead>{t('service.devices.status')}</TableHead>
                  <TableHead>{t('service.devices.nextInspection')}</TableHead>
                  <TableHead>{t('service.devices.installedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((device) => (
                  <TableRow
                    className='cursor-pointer'
                    key={device.id}
                    onClick={() => openEdit(device)}
                  >
                    <TableCell className='font-mono text-xs'>
                      {device.deviceNo}
                    </TableCell>
                    <TableCell>
                      <div className='font-medium'>{device.model}</div>
                      <div className='text-xs text-muted-foreground'>
                        {device.serialNo ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell>{device.customerName ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge kind='device' status={device.status} />
                    </TableCell>
                    <TableCell>{formatDate(device.nextInspectionAt)}</TableCell>
                    <TableCell>{formatDate(device.installedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AsyncBlock>

      <Dialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className='sm:max-w-2xl'>
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editing
                  ? t('service.devices.editTitle')
                  : t('service.devices.createTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('service.devices.formHint')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Field data-invalid={Boolean(fields.deviceNo)}>
                  <FieldLabel>{t('service.devices.deviceNo')}</FieldLabel>
                  <Input
                    aria-invalid={Boolean(fields.deviceNo)}
                    placeholder='DEV-1001'
                    value={form.deviceNo}
                    onChange={(event) =>
                      setForm({ ...form, deviceNo: event.target.value })
                    }
                  />
                  {fields.deviceNo ? (
                    <FieldError>{fields.deviceNo}</FieldError>
                  ) : null}
                </Field>
                <Field data-invalid={Boolean(fields.model)}>
                  <FieldLabel>{t('service.devices.model')}</FieldLabel>
                  <Input
                    aria-invalid={Boolean(fields.model)}
                    value={form.model}
                    onChange={(event) =>
                      setForm({ ...form, model: event.target.value })
                    }
                  />
                  {fields.model ? (
                    <FieldError>{fields.model}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel>{t('service.devices.serialNo')}</FieldLabel>
                  <Input
                    value={form.serialNo}
                    onChange={(event) =>
                      setForm({ ...form, serialNo: event.target.value })
                    }
                  />
                </Field>
                <Field data-invalid={Boolean(fields.customerId)}>
                  <FieldLabel>{t('service.devices.customer')}</FieldLabel>
                  <select
                    aria-invalid={Boolean(fields.customerId)}
                    className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'
                    value={form.customerId}
                    onChange={(event) =>
                      setForm({ ...form, customerId: event.target.value })
                    }
                  >
                    <option value=''>
                      {t('service.devices.selectCustomer')}
                    </option>
                    {(customers.data?.items ?? []).map((customer) => (
                      <option key={customer.id} value={String(customer.id)}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  {fields.customerId ? (
                    <FieldError>{fields.customerId}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel>{t('service.devices.status')}</FieldLabel>
                  <select
                    className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'
                    value={form.status}
                    onChange={(event) =>
                      setForm({ ...form, status: event.target.value })
                    }
                  >
                    {DEVICE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`service.status.device.${status}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel>{t('service.devices.location')}</FieldLabel>
                  <Input
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t('service.devices.installedAt')}</FieldLabel>
                  <Input
                    type='date'
                    value={form.installedAt}
                    onChange={(event) =>
                      setForm({ ...form, installedAt: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t('service.devices.warrantyUntil')}</FieldLabel>
                  <Input
                    type='date'
                    value={form.warrantyUntil}
                    onChange={(event) =>
                      setForm({ ...form, warrantyUntil: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t('service.devices.nextInspection')}</FieldLabel>
                  <Input
                    type='date'
                    value={form.nextInspectionAt}
                    onChange={(event) =>
                      setForm({ ...form, nextInspectionAt: event.target.value })
                    }
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel>{t('service.devices.notes')}</FieldLabel>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                disabled={pending}
                type='button'
                variant='outline'
                onClick={close}
              >
                {t('service.actions.cancel')}
              </Button>
              <Button disabled={pending} type='submit'>
                {editing
                  ? t('service.actions.save')
                  : t('service.actions.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
