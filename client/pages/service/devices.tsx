import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { useServiceApi, type DeviceInput } from '@/service/api.js';
import { useSession } from '@/service/session.js';
import {
  EmptyState,
  ErrorState,
  PageLoading,
  errorMessage,
  formatDate,
  useAsync,
} from '@/service/ui.js';
import type { ServiceDevice } from '@/service/types.js';

const EMPTY: DeviceInput = { serialNumber: '', name: '', enabled: true };

export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const { isSupervisor } = useSession();
  const devices = useAsync(() => api.listDevices(), []);
  const customers = useAsync(() => api.listCustomers(), []);
  const engineers = useAsync(() => api.listEngineers(), []);
  const [editing, setEditing] = useState<DeviceInput>();
  const [removing, setRemoving] = useState<ServiceDevice>();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{
    serialNumber?: string;
    name?: string;
    customerId?: string;
    form?: string;
  }>({});

  const customerName = (id?: number | null): string =>
    customers.data?.find((row) => row.id === id)?.name ?? '—';
  const engineerName = (id?: string | null): string =>
    engineers.data?.find((row) => row.id === id)?.name ?? '—';

  const save = async (): Promise<void> => {
    const value = editing;
    if (!value) {
      return;
    }
    const next: {
      serialNumber?: string;
      name?: string;
      customerId?: string;
      form?: string;
    } = {};
    if (!value.serialNumber?.trim()) {
      next.serialNumber = t('service.devices.serialRequired');
    }
    if (!value.name?.trim()) {
      next.name = t('service.devices.nameRequired');
    }
    if (!value.customerId) {
      next.customerId = t('service.devices.customerRequired');
    }
    if (next.serialNumber || next.name || next.customerId) {
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api.saveDevice(value);
      toaster.show({ type: 'success', title: t('service.common.saved') });
      setEditing(undefined);
      devices.reload();
    } catch (cause) {
      // The server's reason (a duplicate serial number, for example) stays in
      // the dialog beside the fields it concerns instead of only as a toast.
      const message = errorMessage(cause);
      setErrors({ form: message });
      toaster.show({ type: 'error', title: message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!removing) {
      return;
    }
    try {
      await api.deleteDevice(removing.id);
      toaster.show({ type: 'success', title: t('service.common.deleted') });
      setRemoving(undefined);
      devices.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
      setRemoving(undefined);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.devices.title')}
        description={t('service.devices.description')}
        actions={
          isSupervisor ? (
            <Button
              onClick={() => {
                setErrors({});
                setEditing({ ...EMPTY });
              }}
            >
              <Plus />
              {t('service.devices.create')}
            </Button>
          ) : undefined
        }
      />

      {devices.loading ? <PageLoading /> : null}
      {devices.error ? (
        <ErrorState error={devices.error} onRetry={devices.reload} />
      ) : null}

      {!devices.loading && !devices.error ? (
        devices.data && devices.data.length > 0 ? (
          <div className='rounded-lg border border-border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.devices.serialNumber')}</TableHead>
                  <TableHead>{t('service.devices.name')}</TableHead>
                  <TableHead>{t('service.devices.customer')}</TableHead>
                  <TableHead>{t('service.devices.engineer')}</TableHead>
                  <TableHead>{t('service.devices.nextInspection')}</TableHead>
                  <TableHead>{t('service.devices.enabled')}</TableHead>
                  {isSupervisor ? (
                    <TableHead className='text-right'>
                      {t('service.common.actions')}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.data.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className='font-mono text-xs'>
                      {device.serialNumber}
                    </TableCell>
                    <TableCell className='font-medium'>{device.name}</TableCell>
                    <TableCell>{customerName(device.customerId)}</TableCell>
                    <TableCell>{engineerName(device.engineerId)}</TableCell>
                    <TableCell>
                      {formatDate(device.nextInspectionDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={device.enabled ? 'default' : 'secondary'}>
                        {device.enabled
                          ? t('service.devices.enabledYes')
                          : t('service.devices.enabledNo')}
                      </Badge>
                    </TableCell>
                    {isSupervisor ? (
                      <TableCell className='text-right'>
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => {
                            setErrors({});
                            setEditing({
                              id: device.id,
                              serialNumber: device.serialNumber,
                              name: device.name,
                              customerId: device.customerId ?? null,
                              engineerId: device.engineerId ?? null,
                              enabled: device.enabled,
                              installedAt: device.installedAt ?? null,
                              nextInspectionDate:
                                device.nextInspectionDate ?? null,
                              model: device.model ?? '',
                              location: device.location ?? '',
                              note: device.note ?? '',
                            });
                          }}
                        >
                          <Pencil />
                          {t('service.common.edit')}
                        </Button>
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => setRemoving(device)}
                        >
                          <Trash2 />
                          {t('service.common.delete')}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState />
        )
      ) : null}

      <DeviceDialog
        value={editing}
        saving={saving}
        errors={errors}
        customers={customers.data ?? []}
        engineers={engineers.data ?? []}
        onChange={(next) => {
          setEditing(next);
          if (Object.keys(errors).length > 0) {
            setErrors({});
          }
        }}
        onClose={() => {
          setErrors({});
          setEditing(undefined);
        }}
        onSave={() => void save()}
      />

      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.devices.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.devices.deleteDescription', {
                name: removing?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>
              {t('service.common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function DeviceDialog({
  value,
  saving,
  errors,
  customers,
  engineers,
  onChange,
  onClose,
  onSave,
}: {
  readonly value?: DeviceInput;
  readonly saving: boolean;
  readonly errors: {
    serialNumber?: string;
    name?: string;
    customerId?: string;
    form?: string;
  };
  readonly customers: readonly { id: number; name: string }[];
  readonly engineers: readonly { id: string; name: string }[];
  readonly onChange: (value: DeviceInput) => void;
  readonly onClose: () => void;
  readonly onSave: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const update = (patch: Partial<DeviceInput>): void =>
    onChange({ ...(value ?? EMPTY), ...patch });

  return (
    <Dialog open={Boolean(value)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {value?.id
              ? t('service.devices.editTitle')
              : t('service.devices.create')}
          </DialogTitle>
          <DialogDescription>
            {t('service.devices.dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          {errors.form ? (
            <p className='text-sm text-destructive' role='alert'>
              {errors.form}
            </p>
          ) : null}
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='device-serial'>
                {t('service.devices.serialNumber')}
              </Label>
              <Input
                aria-invalid={errors.serialNumber ? true : undefined}
                id='device-serial'
                value={value?.serialNumber ?? ''}
                onChange={(event) =>
                  update({ serialNumber: event.target.value })
                }
              />
              {errors.serialNumber ? (
                <p className='text-sm text-destructive' role='alert'>
                  {errors.serialNumber}
                </p>
              ) : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='device-name'>{t('service.devices.name')}</Label>
              <Input
                aria-invalid={errors.name ? true : undefined}
                id='device-name'
                value={value?.name ?? ''}
                onChange={(event) => update({ name: event.target.value })}
              />
              {errors.name ? (
                <p className='text-sm text-destructive' role='alert'>
                  {errors.name}
                </p>
              ) : null}
            </div>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label>{t('service.devices.customer')}</Label>
              <Select
                items={customers.map((customer) => ({
                  value: String(customer.id),
                  label: customer.name,
                }))}
                value={value?.customerId ? String(value.customerId) : undefined}
                onValueChange={(next) =>
                  update({ customerId: next ? Number(next) : null })
                }
              >
                <SelectTrigger
                  aria-invalid={errors.customerId ? true : undefined}
                >
                  <SelectValue
                    placeholder={t('service.devices.selectCustomer')}
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
              {errors.customerId ? (
                <p className='text-sm text-destructive' role='alert'>
                  {errors.customerId}
                </p>
              ) : null}
            </div>
            <div className='grid gap-2'>
              <Label>{t('service.devices.engineer')}</Label>
              <Select
                items={engineers.map((engineer) => ({
                  value: engineer.id,
                  label: engineer.name,
                }))}
                value={value?.engineerId ?? undefined}
                onValueChange={(next) => update({ engineerId: next })}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('service.devices.selectEngineer')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map((engineer) => (
                    <SelectItem key={engineer.id} value={engineer.id}>
                      {engineer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='device-model'>{t('service.devices.model')}</Label>
              <Input
                id='device-model'
                value={value?.model ?? ''}
                onChange={(event) => update({ model: event.target.value })}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='device-location'>
                {t('service.devices.location')}
              </Label>
              <Input
                id='device-location'
                value={value?.location ?? ''}
                onChange={(event) => update({ location: event.target.value })}
              />
            </div>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='device-installed'>
                {t('service.devices.installedAt')}
              </Label>
              <Input
                id='device-installed'
                type='date'
                value={value?.installedAt?.slice(0, 10) ?? ''}
                onChange={(event) =>
                  update({ installedAt: event.target.value || null })
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='device-inspection'>
                {t('service.devices.nextInspection')}
              </Label>
              <Input
                id='device-inspection'
                type='date'
                value={value?.nextInspectionDate?.slice(0, 10) ?? ''}
                onChange={(event) =>
                  update({ nextInspectionDate: event.target.value || null })
                }
              />
            </div>
          </div>
          <div className='flex items-center justify-between rounded-md border border-border px-3 py-2'>
            <Label htmlFor='device-enabled'>
              {t('service.devices.enabled')}
            </Label>
            <Switch
              id='device-enabled'
              checked={value?.enabled ?? true}
              onCheckedChange={(checked) => update({ enabled: checked })}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='device-note'>{t('service.devices.note')}</Label>
            <Textarea
              id='device-note'
              value={value?.note ?? ''}
              onChange={(event) => update({ note: event.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
