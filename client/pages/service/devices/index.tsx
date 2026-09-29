import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import {
  createDevice,
  fetchCustomers,
  fetchDevices,
  fetchEngineers,
  updateDevice,
  type Customer,
  type Device,
  type Engineer,
} from '../api.js';
import { formatDate } from '../format.js';
import { LoadingBlock, QueryError } from '../shared.js';

/** Device ledger, including the next inspection date the Scheduler maintains. */
export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const [state, setState] = useState<{
    key: string;
    devices?: Device[];
    error?: unknown;
  }>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [editing, setEditing] = useState<Device | 'new' | undefined>();

  const requestKey = String(reloadCount);
  useEffect(() => {
    const controller = new AbortController();
    fetchDevices(api).then(
      (devices) => {
        if (!controller.signal.aborted)
          setState({ key: String(reloadCount), devices });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState({ key: String(reloadCount), error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  useEffect(() => {
    let active = true;
    void Promise.all([fetchCustomers(api), fetchEngineers(api)]).then(
      ([customerList, engineerList]) => {
        if (!active) return;
        setCustomers(customerList);
        setEngineers(engineerList);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api]);

  const loading = state?.key !== requestKey;

  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('service.devices.column.code'),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.code}</span>
        ),
      },
      { accessorKey: 'name', header: t('service.devices.column.name') },
      { accessorKey: 'customerName', header: t('service.common.customer') },
      {
        accessorKey: 'engineerName',
        header: t('service.devices.column.engineer'),
        cell: ({ row }) => (
          <span>
            {row.original.engineerName ?? t('service.common.unassigned')}
          </span>
        ),
      },
      {
        id: 'enabled',
        header: t('service.devices.column.enabled'),
        cell: ({ row }) =>
          row.original.enabled ? (
            <Badge variant='secondary'>{t('service.devices.active')}</Badge>
          ) : (
            <Badge variant='outline'>{t('service.devices.inactive')}</Badge>
          ),
      },
      {
        accessorKey: 'nextInspectionDate',
        header: t('service.devices.column.nextInspection'),
        cell: ({ row }) => (
          <span>{formatDate(row.original.nextInspectionDate)}</span>
        ),
      },
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
            {t('service.actions.edit')}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.devices.title')}
        description={t('service.devices.description')}
        actions={
          <Button
            onClick={() => setEditing('new')}
            disabled={!customers.length}
          >
            <PlusIcon />
            {t('service.devices.create')}
          </Button>
        }
      />
      {state?.error ? (
        <QueryError
          error={state.error}
          onRetry={() => setReloadCount((count) => count + 1)}
        />
      ) : loading && !state?.devices ? (
        <LoadingBlock />
      ) : (
        <DataTable
          columns={columns}
          data={state?.devices ?? []}
          getRowId={(row) => String(row.id)}
          emptyMessage={t('service.devices.empty')}
        />
      )}
      {editing ? (
        <DeviceDialog
          device={editing === 'new' ? undefined : editing}
          customers={customers}
          engineers={engineers}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setReloadCount((count) => count + 1);
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function DeviceDialog({
  device,
  customers,
  engineers,
  onClose,
  onSaved,
}: {
  readonly device?: Device;
  readonly customers: Customer[];
  readonly engineers: Engineer[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [form, setForm] = useState({
    code: device?.code ?? '',
    name: device?.name ?? '',
    model: device?.model ?? '',
    serialNo: device?.serialNo ?? '',
    customerId: device ? String(device.customerId) : '',
    engineerId: device?.engineerId ?? '',
    enabled: device?.enabled ?? true,
    nextInspectionDate: device?.nextInspectionDate?.slice(0, 10) ?? '',
  });

  async function submit(): Promise<void> {
    if (!form.code.trim() || !form.name.trim()) {
      setError(t('service.devices.form.required'));
      return;
    }
    if (!form.customerId) {
      setError(t('service.tickets.form.customerRequired'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        model: form.model.trim() || null,
        serialNo: form.serialNo.trim() || null,
        customerId: Number(form.customerId),
        engineerId: form.engineerId || null,
        enabled: form.enabled,
        nextInspectionDate: form.nextInspectionDate || null,
      };
      if (device) {
        const { code: _code, ...changes } = payload;
        await updateDevice(api, device.id, changes);
      } else {
        await createDevice(api, payload);
      }
      toaster.show({ type: 'success', title: t('service.devices.form.saved') });
      onSaved();
    } catch (err: unknown) {
      setError(
        err instanceof ApiClientError && err.status === 403
          ? t('service.error.forbidden')
          : t('service.devices.form.saveFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {device ? t('service.devices.edit') : t('service.devices.create')}
          </DialogTitle>
          <DialogDescription>
            {t('service.devices.form.description')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='device-code'>
                {t('service.devices.column.code')}
              </FieldLabel>
              <Input
                id='device-code'
                value={form.code}
                onChange={(event) =>
                  setForm((c) => ({ ...c, code: event.target.value }))
                }
                disabled={Boolean(device)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='device-name'>
                {t('service.devices.column.name')}
              </FieldLabel>
              <Input
                id='device-name'
                value={form.name}
                onChange={(event) =>
                  setForm((c) => ({ ...c, name: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='device-model'>
                {t('service.devices.form.model')}
              </FieldLabel>
              <Input
                id='device-model'
                value={form.model}
                onChange={(event) =>
                  setForm((c) => ({ ...c, model: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='device-serial'>
                {t('service.devices.form.serialNo')}
              </FieldLabel>
              <Input
                id='device-serial'
                value={form.serialNo}
                onChange={(event) =>
                  setForm((c) => ({ ...c, serialNo: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='device-customer'>
                {t('service.common.customer')}
              </FieldLabel>
              <Select
                items={customers.map((customer) => ({
                  value: String(customer.id),
                  label: customer.name,
                }))}
                value={form.customerId || null}
                onValueChange={(value: string | null) =>
                  setForm((c) => ({ ...c, customerId: value ?? '' }))
                }
              >
                <SelectTrigger id='device-customer' className='w-full'>
                  <SelectValue
                    placeholder={t('service.common.selectCustomer')}
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
            <Field>
              <FieldLabel htmlFor='device-engineer'>
                {t('service.devices.column.engineer')}
              </FieldLabel>
              <Select
                items={[
                  { value: null, label: t('service.common.unassigned') },
                  ...engineers.map((engineer) => ({
                    value: engineer.id,
                    label: engineer.name,
                  })),
                ]}
                value={form.engineerId || null}
                onValueChange={(value: string | null) =>
                  setForm((c) => ({ ...c, engineerId: value ?? '' }))
                }
              >
                <SelectTrigger id='device-engineer' className='w-full'>
                  <SelectValue placeholder={t('service.common.unassigned')} />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map((engineer) => (
                    <SelectItem key={engineer.id} value={engineer.id}>
                      {engineer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='device-next'>
                {t('service.devices.column.nextInspection')}
              </FieldLabel>
              <Input
                id='device-next'
                type='date'
                value={form.nextInspectionDate}
                onChange={(event) =>
                  setForm((c) => ({
                    ...c,
                    nextInspectionDate: event.target.value,
                  }))
                }
              />
            </Field>
            <Field orientation='horizontal'>
              <FieldLabel htmlFor='device-enabled'>
                {t('service.devices.column.enabled')}
              </FieldLabel>
              <Switch
                id='device-enabled'
                checked={form.enabled}
                onCheckedChange={(checked: boolean) =>
                  setForm((c) => ({ ...c, enabled: checked }))
                }
              />
            </Field>
          </div>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        </FieldGroup>
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={busy}>
            {t('service.actions.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {t('service.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
